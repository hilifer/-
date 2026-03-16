"""
附件解析模块
============
功能：
1. Excel 多 Sheet 解析，提取电表相关数据
2. PDF 文本提取，识别表格数据
3. 图片 OCR 识别单价并关联用户编号

核心逻辑：
- 根据 config.yaml 中的 field_mapping 将各种列名映射为统一字段
- 根据 meter_type_rules 判定电表类型（上网表/发电表）
- 根据 ocr 配置从图片中提取单价和用户编号
"""

import os
import re
import logging
from typing import List, Dict, Optional, Any

import pandas as pd
import yaml

logger = logging.getLogger(__name__)


def load_config(config_path: str = "config.yaml") -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ============================================================
# 字段映射工具
# ============================================================

def find_mapped_column(df_columns: List[str], field_aliases: List[str]) -> Optional[str]:
    """
    在 DataFrame 的列名中查找与配置的别名列表匹配的列
    返回第一个匹配的列名，无匹配则返回 None

    >>> find_mapped_column(["资产号", "表号", "用户编号"], ["电表号", "表号"])
    '表号'
    """
    for alias in field_aliases:
        for col in df_columns:
            if alias in str(col):
                return col
    return None


def determine_meter_type(row_data: dict, sheet_name: str, config: dict) -> str:
    """
    判定电表类型：上网表 / 发电表
    判定依据：
    1. Sheet 名称中的关键词
    2. 行数据中出现的关键词
    3. 配置文件中的 meter_type_rules

    可在 config.yaml 的 meter_type_rules 中修改判定关键词
    """
    rules = config.get("meter_type_rules", {})

    # 合并所有文本用于关键词匹配
    text_to_check = sheet_name + " " + " ".join(str(v) for v in row_data.values())

    for type_key, rule in rules.items():
        for keyword in rule.get("keywords", []):
            if keyword in text_to_check:
                return type_key  # "grid_feed" 或 "generation"

    return "unknown"


# ============================================================
# Excel 解析
# ============================================================

def parse_excel(filepath: str, config: dict) -> List[Dict[str, Any]]:
    """
    解析 Excel 文件（支持多 Sheet），提取电表相关数据
    每一行生成一条以电表为核心的记录

    返回列表，每条记录包含：
    - meter_number: 电表号
    - asset_number: 资产编号
    - user_id: 用户编号
    - meter_type: 电表类型 (grid_feed / generation)
    - multiplier: 倍率
    - project: 项目名
    - reading_date: 抄表日期
    - peak_sharp / peak / flat / valley: 各时段电量
    - total_kwh: 总电量
    - source_file: 来源文件
    - source_sheet: 来源 Sheet
    """
    mapping = config.get("field_mapping", {})
    records = []

    try:
        xls = pd.ExcelFile(filepath)
    except Exception as e:
        logger.error(f"无法打开 Excel 文件 {filepath}: {e}")
        return []

    for sheet_name in xls.sheet_names:
        logger.info(f"  解析 Sheet: {sheet_name}")
        try:
            df = pd.read_excel(xls, sheet_name=sheet_name)
        except Exception as e:
            logger.warning(f"  读取 Sheet {sheet_name} 失败: {e}")
            continue

        if df.empty:
            continue

        columns = list(df.columns)

        # --- 查找各字段对应的列名 ---
        col_meter = find_mapped_column(columns, mapping.get("meter_number", []))
        col_asset = find_mapped_column(columns, mapping.get("asset_number", []))
        col_user = find_mapped_column(columns, mapping.get("user_id", []))
        col_multiplier = find_mapped_column(columns, mapping.get("multiplier", []))
        col_project = find_mapped_column(columns, mapping.get("project_name", []))
        col_date = find_mapped_column(columns, mapping.get("reading_date", []))
        col_peak_sharp = find_mapped_column(columns, mapping.get("peak_sharp", []))
        col_peak = find_mapped_column(columns, mapping.get("peak", []))
        col_flat = find_mapped_column(columns, mapping.get("flat", []))
        col_valley = find_mapped_column(columns, mapping.get("valley", []))
        col_total = find_mapped_column(columns, mapping.get("total_kwh", []))

        # 电表号是必须字段，没有则跳过该 Sheet
        if not col_meter:
            logger.debug(f"  Sheet {sheet_name} 中未找到电表号列，跳过")
            continue

        # --- 逐行提取 ---
        for _, row in df.iterrows():
            meter_number = str(row.get(col_meter, "")).strip()
            if not meter_number or meter_number == "nan":
                continue

            row_dict = row.to_dict()
            meter_type = determine_meter_type(row_dict, sheet_name, config)

            record = {
                "meter_number": meter_number,
                "asset_number": str(row.get(col_asset, "")).strip() if col_asset else "",
                "user_id": str(row.get(col_user, "")).strip() if col_user else "",
                "meter_type": meter_type,
                "multiplier": row.get(col_multiplier, "") if col_multiplier else "",
                "project": str(row.get(col_project, "")).strip() if col_project else "",
                "reading_date": str(row.get(col_date, "")).strip() if col_date else "",
                "peak_sharp": row.get(col_peak_sharp, None) if col_peak_sharp else None,
                "peak": row.get(col_peak, None) if col_peak else None,
                "flat": row.get(col_flat, None) if col_flat else None,
                "valley": row.get(col_valley, None) if col_valley else None,
                "total_kwh": row.get(col_total, None) if col_total else None,
                "source_file": os.path.basename(filepath),
                "source_sheet": sheet_name,
            }

            # 清理 nan 值
            for k, v in record.items():
                if pd.isna(v) if isinstance(v, float) else (str(v) == "nan"):
                    record[k] = None

            records.append(record)

    logger.info(f"  从 {filepath} 提取 {len(records)} 条电表记录")
    return records


# ============================================================
# PDF 解析
# ============================================================

def parse_pdf(filepath: str, config: dict) -> List[Dict[str, Any]]:
    """
    从 PDF 中提取文本，尝试识别表格结构的电表数据
    使用 pdfplumber 提取表格和文本
    """
    try:
        import pdfplumber
    except ImportError:
        logger.error("需要安装 pdfplumber: pip install pdfplumber")
        return []

    records = []
    mapping = config.get("field_mapping", {})

    try:
        with pdfplumber.open(filepath) as pdf:
            for page_num, page in enumerate(pdf.pages):
                # 优先尝试提取表格
                tables = page.extract_tables()
                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    # 第一行作为表头
                    headers = [str(h).strip() if h else "" for h in table[0]]
                    col_meter = find_mapped_column(headers, mapping.get("meter_number", []))
                    if not col_meter:
                        continue

                    meter_idx = headers.index(col_meter)

                    for row in table[1:]:
                        if not row or len(row) <= meter_idx:
                            continue
                        meter_number = str(row[meter_idx]).strip()
                        if not meter_number:
                            continue

                        # 构建记录（尽量从表格中提取）
                        record = {
                            "meter_number": meter_number,
                            "source_file": os.path.basename(filepath),
                            "source_sheet": f"PDF_page_{page_num + 1}",
                        }

                        # 尝试映射其他字段
                        for field_key in ["asset_number", "user_id", "multiplier",
                                          "project_name", "reading_date",
                                          "peak_sharp", "peak", "flat", "valley", "total_kwh"]:
                            col_name = find_mapped_column(headers, mapping.get(field_key, []))
                            if col_name and col_name in headers:
                                idx = headers.index(col_name)
                                if idx < len(row):
                                    db_key = field_key if field_key != "project_name" else "project"
                                    record[db_key] = str(row[idx]).strip() if row[idx] else None

                        records.append(record)

                # 如果没有提取到表格，尝试纯文本解析
                if not tables:
                    text = page.extract_text()
                    if text:
                        logger.debug(f"  PDF 第 {page_num+1} 页纯文本（前200字符）: {text[:200]}")

    except Exception as e:
        logger.error(f"PDF 解析失败 {filepath}: {e}")

    logger.info(f"  从 {filepath} 提取 {len(records)} 条 PDF 记录")
    return records


# ============================================================
# 图片 OCR - 提取单价和用户编号
# ============================================================

def parse_image_ocr(filepath: str, config: dict) -> Dict[str, Any]:
    """
    对图片进行 OCR 识别，提取：
    1. 用户编号（用于与抄表数据关联）
    2. 各时段单价（尖峰、峰、平、谷）

    返回字典：
    {
        "user_id": "123456",
        "prices": {"peak_sharp": 1.05, "peak": 0.85, "flat": 0.55, "valley": 0.30},
        "raw_text": "OCR 原始识别文本",
        "source_file": "xxx.png"
    }

    可在 config.yaml 的 ocr 部分修改正则匹配规则
    """
    ocr_cfg = config.get("ocr", {})
    result = {
        "user_id": None,
        "prices": {},
        "raw_text": "",
        "source_file": os.path.basename(filepath),
    }

    try:
        from PIL import Image
    except ImportError:
        logger.error("需要安装 Pillow: pip install Pillow")
        return result

    # --- OCR 识别 ---
    ocr_text = ""
    engine = ocr_cfg.get("engine", "tesseract")

    if engine == "tesseract":
        try:
            import pytesseract
            lang = ocr_cfg.get("tesseract_lang", "chi_sim+eng")
            img = Image.open(filepath)
            ocr_text = pytesseract.image_to_string(img, lang=lang)
        except ImportError:
            logger.error("需要安装 pytesseract: pip install pytesseract")
            return result
        except Exception as e:
            logger.error(f"Tesseract OCR 失败 {filepath}: {e}")
            return result
    else:
        logger.warning(f"不支持的 OCR 引擎: {engine}，请在 config.yaml 中配置")
        return result

    result["raw_text"] = ocr_text
    logger.debug(f"  OCR 文本（前300字）: {ocr_text[:300]}")

    # --- 提取用户编号 ---
    for pattern in ocr_cfg.get("user_id_patterns", []):
        match = re.search(pattern, ocr_text)
        if match:
            result["user_id"] = match.group(1)
            logger.info(f"  OCR 提取用户编号: {result['user_id']}")
            break

    # --- 提取单价 ---
    price_patterns = ocr_cfg.get("price_patterns", [])
    price_keys = ["peak_sharp", "peak", "flat", "valley"]
    for i, pattern in enumerate(price_patterns):
        match = re.search(pattern, ocr_text)
        if match and i < len(price_keys):
            try:
                result["prices"][price_keys[i]] = float(match.group(1))
            except (ValueError, IndexError):
                pass

    if result["prices"]:
        logger.info(f"  OCR 提取单价: {result['prices']}")

    return result


# ============================================================
# 统一入口：解析所有附件
# ============================================================

def parse_all_attachments(
    file_list: List[Dict[str, str]],
    config: dict
) -> Dict[str, List]:
    """
    对下载的所有附件进行解析
    file_list: email_fetcher 返回的文件信息列表

    返回:
    {
        "meter_records": [...],   # 电表 + 抄表数据记录
        "price_records": [...],   # OCR 提取的单价记录
    }
    """
    meter_records = []
    price_records = []

    for file_info in file_list:
        filepath = file_info["filepath"]
        ext = os.path.splitext(filepath)[1].lower()

        logger.info(f"解析附件: {filepath}")

        if ext in (".xlsx", ".xls"):
            records = parse_excel(filepath, config)
            # 补充邮件级别的元数据
            for r in records:
                r["month"] = file_info.get("month", "")
                if not r.get("project"):
                    r["project"] = file_info.get("project", "未分类")
            meter_records.extend(records)

        elif ext == ".pdf":
            records = parse_pdf(filepath, config)
            for r in records:
                r["month"] = file_info.get("month", "")
                if not r.get("project"):
                    r["project"] = file_info.get("project", "未分类")
            meter_records.extend(records)

        elif ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff"):
            price_info = parse_image_ocr(filepath, config)
            price_info["month"] = file_info.get("month", "")
            price_info["project"] = file_info.get("project", "未分类")
            if price_info["user_id"] or price_info["prices"]:
                price_records.append(price_info)

        elif ext == ".csv":
            try:
                df = pd.read_csv(filepath, encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(filepath, encoding="gbk")
            # 将 CSV 当作单 Sheet Excel 处理
            records = parse_excel_dataframe(df, "CSV", filepath, config)
            for r in records:
                r["month"] = file_info.get("month", "")
                if not r.get("project"):
                    r["project"] = file_info.get("project", "未分类")
            meter_records.extend(records)

    logger.info(f"解析完成: {len(meter_records)} 条电表记录, {len(price_records)} 条单价记录")
    return {
        "meter_records": meter_records,
        "price_records": price_records,
    }


def parse_excel_dataframe(
    df: pd.DataFrame,
    sheet_name: str,
    filepath: str,
    config: dict
) -> List[Dict[str, Any]]:
    """将单个 DataFrame 按电表映射规则解析为记录列表（复用 Excel 解析逻辑）"""
    mapping = config.get("field_mapping", {})
    records = []

    if df.empty:
        return records

    columns = list(df.columns)
    col_meter = find_mapped_column(columns, mapping.get("meter_number", []))
    if not col_meter:
        return records

    col_asset = find_mapped_column(columns, mapping.get("asset_number", []))
    col_user = find_mapped_column(columns, mapping.get("user_id", []))
    col_multiplier = find_mapped_column(columns, mapping.get("multiplier", []))
    col_project = find_mapped_column(columns, mapping.get("project_name", []))
    col_date = find_mapped_column(columns, mapping.get("reading_date", []))
    col_peak_sharp = find_mapped_column(columns, mapping.get("peak_sharp", []))
    col_peak = find_mapped_column(columns, mapping.get("peak", []))
    col_flat = find_mapped_column(columns, mapping.get("flat", []))
    col_valley = find_mapped_column(columns, mapping.get("valley", []))
    col_total = find_mapped_column(columns, mapping.get("total_kwh", []))

    for _, row in df.iterrows():
        meter_number = str(row.get(col_meter, "")).strip()
        if not meter_number or meter_number == "nan":
            continue

        row_dict = row.to_dict()
        meter_type = determine_meter_type(row_dict, sheet_name, config)

        record = {
            "meter_number": meter_number,
            "asset_number": str(row.get(col_asset, "")).strip() if col_asset else "",
            "user_id": str(row.get(col_user, "")).strip() if col_user else "",
            "meter_type": meter_type,
            "multiplier": row.get(col_multiplier, "") if col_multiplier else "",
            "project": str(row.get(col_project, "")).strip() if col_project else "",
            "reading_date": str(row.get(col_date, "")).strip() if col_date else "",
            "peak_sharp": row.get(col_peak_sharp, None) if col_peak_sharp else None,
            "peak": row.get(col_peak, None) if col_peak else None,
            "flat": row.get(col_flat, None) if col_flat else None,
            "valley": row.get(col_valley, None) if col_valley else None,
            "total_kwh": row.get(col_total, None) if col_total else None,
            "source_file": os.path.basename(filepath),
            "source_sheet": sheet_name,
        }

        for k, v in record.items():
            if pd.isna(v) if isinstance(v, float) else (str(v) == "nan"):
                record[k] = None

        records.append(record)

    return records
