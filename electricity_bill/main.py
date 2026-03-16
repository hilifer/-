#!/usr/bin/env python3
"""
电费自动化项目 - 主入口
=======================
用法:
    python main.py                        # 完整流程：邮件抓取 -> 解析 -> 清洗 -> 存储 -> 可视化
    python main.py --skip-email           # 跳过邮件抓取，仅解析已下载的附件
    python main.py --export-csv           # 导出数据库到 CSV
    python main.py --import-csv           # 从 CSV 重新导入到数据库
    python main.py --visualize            # 仅生成可视化图表
    python main.py --project "项目A"      # 按项目过滤后生成图表
    python main.py --user-id "123456"     # 按用户编号过滤后生成图表
    python main.py --report               # 输出数据摘要报告
"""

import argparse
import logging
import os
import sys
import glob

from email_fetcher import load_config, fetch_and_save_attachments
from attachment_parser import parse_all_attachments
from data_cleaner import clean_and_structure
from data_filter import (
    filter_by_project, filter_by_user_id,
    summary_report, list_projects, list_user_ids,
)
from storage import (
    save_to_database, export_to_csv, import_from_csv,
    load_meter_master, load_monthly_readings,
)
from visualizer import generate_all_charts


def setup_logging():
    """配置日志"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("electricity_bill.log", encoding="utf-8"),
        ]
    )


def scan_existing_attachments(config: dict):
    """
    扫描已下载的附件目录，构建 file_list
    用于 --skip-email 模式
    """
    att_dir = config["storage"]["attachments_dir"]
    file_list = []

    if not os.path.exists(att_dir):
        return file_list

    for month_dir in sorted(os.listdir(att_dir)):
        month_path = os.path.join(att_dir, month_dir)
        if not os.path.isdir(month_path):
            continue

        for project_dir in sorted(os.listdir(month_path)):
            project_path = os.path.join(month_path, project_dir)
            if not os.path.isdir(project_path):
                continue

            for filename in os.listdir(project_path):
                filepath = os.path.join(project_path, filename)
                if os.path.isfile(filepath):
                    file_list.append({
                        "filepath": filepath,
                        "month": month_dir,
                        "project": project_dir,
                        "subject": "",
                        "email_date": "",
                    })

    return file_list


def main():
    setup_logging()
    logger = logging.getLogger("main")

    parser = argparse.ArgumentParser(description="电费自动化项目")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径")
    parser.add_argument("--skip-email", action="store_true", help="跳过邮件抓取")
    parser.add_argument("--export-csv", action="store_true", help="导出到 CSV")
    parser.add_argument("--import-csv", action="store_true", help="从 CSV 导入")
    parser.add_argument("--visualize", action="store_true", help="仅生成图表")
    parser.add_argument("--project", type=str, help="按项目名过滤")
    parser.add_argument("--user-id", type=str, help="按用户编号过滤")
    parser.add_argument("--report", action="store_true", help="输出摘要报告")
    args = parser.parse_args()

    config = load_config(args.config)
    db_path = config["storage"]["db_path"]
    csv_dir = config["storage"]["csv_export_dir"]

    # --- 仅导出 CSV ---
    if args.export_csv:
        export_to_csv(db_path, csv_dir)
        logger.info("CSV 导出完成")
        return

    # --- 仅导入 CSV ---
    if args.import_csv:
        import_from_csv(db_path, csv_dir)
        logger.info("CSV 导入完成")
        return

    # --- 仅生成图表 ---
    if args.visualize:
        master = load_meter_master(db_path)
        monthly = load_monthly_readings(db_path)
        generate_all_charts(
            master, monthly, config,
            project_filter=args.project,
            user_id_filter=args.user_id,
        )
        return

    # --- 仅输出报告 ---
    if args.report:
        master = load_meter_master(db_path)
        monthly = load_monthly_readings(db_path)

        print(summary_report(master, monthly))

        if args.project:
            m, r = filter_by_project(master, monthly, args.project)
            print(f"\n--- 项目 '{args.project}' 筛选结果 ---")
            print(f"电表: {[x['meter_number'] for x in m]}")
            print(f"月度记录: {len(r)} 条")

        if args.user_id:
            m, r = filter_by_user_id(master, monthly, args.user_id)
            print(f"\n--- 用户编号 '{args.user_id}' 筛选结果 ---")
            print(f"电表: {[x['meter_number'] for x in m]}")
            print(f"月度记录: {len(r)} 条")
        return

    # ============================================================
    # 完整流程
    # ============================================================

    # Step 1: 邮件抓取 & 附件下载
    if args.skip_email:
        logger.info("跳过邮件抓取，扫描已有附件...")
        file_list = scan_existing_attachments(config)
        logger.info(f"发现 {len(file_list)} 个已有附件")
    else:
        logger.info("Step 1: 连接邮箱，下载附件...")
        file_list = fetch_and_save_attachments(config)

    if not file_list:
        logger.warning("未找到任何附件，流程结束")
        return

    # Step 2: 附件解析
    logger.info("Step 2: 解析附件...")
    parsed = parse_all_attachments(file_list, config)

    # Step 3: 数据清洗与关联
    logger.info("Step 3: 数据清洗与关联...")
    master, monthly = clean_and_structure(
        parsed["meter_records"],
        parsed["price_records"],
    )

    # Step 4: 存储到数据库
    logger.info("Step 4: 存储到数据库...")
    save_to_database(db_path, master, monthly)

    # Step 5: 导出 CSV（便于人工查看和编辑）
    logger.info("Step 5: 导出 CSV...")
    export_to_csv(db_path, csv_dir)

    # Step 6: 生成可视化图表
    logger.info("Step 6: 生成可视化图表...")
    generate_all_charts(
        master, monthly, config,
        project_filter=args.project,
        user_id_filter=args.user_id,
    )

    # 输出摘要
    print("\n" + summary_report(master, monthly))
    logger.info("全部流程完成！")


if __name__ == "__main__":
    main()
