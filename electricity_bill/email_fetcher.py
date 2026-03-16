"""
邮箱连接 & 附件下载模块
========================
功能：
1. 通过 IMAP SSL 连接 QQ 邮箱
2. 按配置规则筛选电费相关邮件
3. 下载附件并按 月份/项目 归档到本地目录
"""

import imaplib
import email
from email.header import decode_header
import os
import re
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple

import yaml

logger = logging.getLogger(__name__)


def load_config(config_path: str = "config.yaml") -> dict:
    """加载 YAML 配置文件"""
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def decode_mime_words(s: str) -> str:
    """解码 MIME 编码的邮件头字段（如主题、发件人）"""
    if s is None:
        return ""
    decoded_parts = decode_header(s)
    result = []
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)


def connect_imap(config: dict) -> imaplib.IMAP4_SSL:
    """建立 IMAP 连接并登录"""
    email_cfg = config["email"]
    logger.info(f"连接邮箱服务器: {email_cfg['imap_server']}:{email_cfg['imap_port']}")

    mail = imaplib.IMAP4_SSL(email_cfg["imap_server"], email_cfg["imap_port"])
    mail.login(email_cfg["username"], email_cfg["auth_code"])
    logger.info("邮箱登录成功")
    return mail


def search_emails(mail: imaplib.IMAP4_SSL, config: dict) -> List[bytes]:
    """
    在收件箱中搜索符合条件的邮件
    筛选逻辑：发件人或主题包含"电费"关键词，且收件人包含"曹先生"
    """
    mail.select("INBOX")
    filter_cfg = config["email_filter"]

    # 构建 IMAP 搜索条件
    # IMAP SEARCH 命令不直接支持中文关键词的复杂 OR 逻辑，
    # 因此先拉取全部邮件，再在 Python 层做精确过滤
    search_criteria = "ALL"

    # 如果配置了起始日期，使用 SINCE 缩小范围
    if filter_cfg.get("since_date"):
        since = datetime.strptime(filter_cfg["since_date"], "%Y-%m-%d")
        since_str = since.strftime("%d-%b-%Y")
        search_criteria = f'(SINCE {since_str})'

    status, msg_ids = mail.search(None, search_criteria)
    if status != "OK":
        logger.error("邮件搜索失败")
        return []

    all_ids = msg_ids[0].split()
    logger.info(f"共找到 {len(all_ids)} 封邮件，开始逐封过滤...")
    return all_ids


def matches_filter(msg: email.message.Message, config: dict) -> bool:
    """
    检查单封邮件是否匹配过滤规则：
    - 发件人或主题包含 subject_keywords / sender_keywords 中的任一关键词
    - 收件人（To）包含 recipient_keywords 中的任一关键词
    """
    filter_cfg = config["email_filter"]

    subject = decode_mime_words(msg.get("Subject", ""))
    sender = decode_mime_words(msg.get("From", ""))
    to_field = decode_mime_words(msg.get("To", ""))

    # 检查发件人或主题是否包含电费关键词
    subject_match = any(kw in subject for kw in filter_cfg["subject_keywords"])
    sender_match = any(kw in sender for kw in filter_cfg["sender_keywords"])

    if not (subject_match or sender_match):
        return False

    # 检查收件人是否包含目标关键词
    recipient_match = any(kw in to_field for kw in filter_cfg["recipient_keywords"])
    if not recipient_match:
        return False

    return True


def extract_month_from_email(msg: email.message.Message) -> str:
    """
    从邮件日期中提取月份字符串，格式: YYYY-MM
    用于按月归档附件
    """
    date_str = msg.get("Date", "")
    if not date_str:
        return datetime.now().strftime("%Y-%m")

    try:
        # 解析邮件日期（多种格式兼容）
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m")
    except Exception:
        return datetime.now().strftime("%Y-%m")


def extract_project_from_subject(msg: email.message.Message) -> str:
    """
    尝试从邮件主题中提取项目名称
    规则：寻找常见模式如"【项目名】"或"项目名-电费"
    如无法提取，返回 "未分类"
    """
    subject = decode_mime_words(msg.get("Subject", ""))

    # 【】中的内容作为项目名
    match = re.search(r'[【\[](.*?)[】\]]', subject)
    if match:
        return match.group(1)

    # "-" 前面的内容作为项目名
    match = re.search(r'^(.+?)[-—].*电费', subject)
    if match:
        return match.group(1).strip()

    return "未分类"


def save_attachment(
    part: email.message.Message,
    month: str,
    project: str,
    config: dict
) -> Optional[str]:
    """
    保存单个附件到归档目录: attachments_dir/YYYY-MM/项目名/文件名
    返回保存的文件路径，无附件则返回 None
    """
    filename = part.get_filename()
    if not filename:
        return None

    filename = decode_mime_words(filename)

    # 只处理目标格式的附件
    ext = os.path.splitext(filename)[1].lower()
    supported_exts = {".xlsx", ".xls", ".csv", ".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".tiff"}
    if ext not in supported_exts:
        logger.debug(f"跳过不支持的附件格式: {filename}")
        return None

    # 创建归档目录: attachments_dir/YYYY-MM/项目名/
    save_dir = os.path.join(
        config["storage"]["attachments_dir"],
        month,
        project
    )
    os.makedirs(save_dir, exist_ok=True)

    # 避免文件名冲突
    filepath = os.path.join(save_dir, filename)
    if os.path.exists(filepath):
        base, extension = os.path.splitext(filename)
        counter = 1
        while os.path.exists(filepath):
            filepath = os.path.join(save_dir, f"{base}_{counter}{extension}")
            counter += 1

    # 写入文件
    payload = part.get_payload(decode=True)
    if payload:
        with open(filepath, "wb") as f:
            f.write(payload)
        logger.info(f"附件已保存: {filepath}")
        return filepath

    return None


def fetch_and_save_attachments(config: dict) -> List[Dict[str, str]]:
    """
    主函数：连接邮箱 -> 搜索邮件 -> 下载附件 -> 按月/项目归档
    返回所有已下载附件的信息列表
    """
    mail = connect_imap(config)
    msg_ids = search_emails(mail, config)

    saved_files = []

    for idx, msg_id in enumerate(msg_ids):
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue

        raw_email = msg_data[0][1]
        msg = email.message_from_bytes(raw_email)

        # 检查是否匹配过滤规则
        if not matches_filter(msg, config):
            continue

        subject = decode_mime_words(msg.get("Subject", ""))
        month = extract_month_from_email(msg)
        project = extract_project_from_subject(msg)
        logger.info(f"[{idx+1}/{len(msg_ids)}] 匹配邮件: {subject} | 月份: {month} | 项目: {project}")

        # 遍历邮件的所有 part，提取附件
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get("Content-Disposition") is None:
                continue

            filepath = save_attachment(part, month, project, config)
            if filepath:
                saved_files.append({
                    "filepath": filepath,
                    "month": month,
                    "project": project,
                    "subject": subject,
                    "email_date": msg.get("Date", ""),
                })

    mail.logout()
    logger.info(f"附件下载完成，共保存 {len(saved_files)} 个文件")
    return saved_files


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    cfg = load_config()
    results = fetch_and_save_attachments(cfg)
    for r in results:
        print(f"  {r['filepath']} (月份={r['month']}, 项目={r['project']})")
