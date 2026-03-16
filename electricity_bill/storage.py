"""
结构化存储模块
==============
功能：
1. SQLite 存储：主表（电表固定信息）+ 月度明细表（增量追加）
2. CSV 导出：可在外部编辑后重新导入
3. 固定信息只写一次，月度数据增量追加（UPSERT）
"""

import os
import sqlite3
import logging
from typing import List, Dict, Any

import pandas as pd

logger = logging.getLogger(__name__)


# ============================================================
# SQLite 操作
# ============================================================

def init_database(db_path: str):
    """
    初始化 SQLite 数据库，创建主表和月度明细表
    如果表已存在则不重复创建
    """
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 电表主表：固定信息只存一次
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meter_master (
            meter_number TEXT PRIMARY KEY,
            asset_number TEXT,
            user_id TEXT,
            meter_type TEXT,
            multiplier TEXT,
            project TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 月度明细表：每月变动数据，增量追加
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS monthly_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meter_number TEXT NOT NULL,
            month TEXT,
            reading_date TEXT,
            peak_sharp REAL,
            peak REAL,
            flat REAL,
            valley REAL,
            total_kwh REAL,
            price_peak_sharp REAL,
            price_peak REAL,
            price_flat REAL,
            price_valley REAL,
            fee_peak_sharp REAL,
            fee_peak REAL,
            fee_flat REAL,
            fee_valley REAL,
            total_fee REAL,
            source_file TEXT,
            source_sheet TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(meter_number, month),
            FOREIGN KEY (meter_number) REFERENCES meter_master(meter_number)
        )
    """)

    # 索引加速查询
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_monthly_meter
        ON monthly_readings(meter_number)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_monthly_month
        ON monthly_readings(month)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_master_user_id
        ON meter_master(user_id)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_master_project
        ON meter_master(project)
    """)

    conn.commit()
    conn.close()
    logger.info(f"数据库初始化完成: {db_path}")


def upsert_meter_master(db_path: str, master_list: List[Dict[str, Any]]):
    """
    写入/更新电表主表
    使用 INSERT OR REPLACE 实现 UPSERT：
    - 新电表：插入
    - 已有电表：更新非空字段
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for meter in master_list:
        cursor.execute("""
            INSERT INTO meter_master (meter_number, asset_number, user_id,
                                      meter_type, multiplier, project, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(meter_number) DO UPDATE SET
                asset_number = CASE
                    WHEN excluded.asset_number != '' THEN excluded.asset_number
                    ELSE meter_master.asset_number END,
                user_id = CASE
                    WHEN excluded.user_id != '' THEN excluded.user_id
                    ELSE meter_master.user_id END,
                meter_type = CASE
                    WHEN excluded.meter_type != 'unknown' THEN excluded.meter_type
                    ELSE meter_master.meter_type END,
                multiplier = CASE
                    WHEN excluded.multiplier != '' THEN excluded.multiplier
                    ELSE meter_master.multiplier END,
                project = CASE
                    WHEN excluded.project != '' THEN excluded.project
                    ELSE meter_master.project END,
                updated_at = CURRENT_TIMESTAMP
        """, (
            meter.get("meter_number", ""),
            meter.get("asset_number", ""),
            meter.get("user_id", ""),
            meter.get("meter_type", "unknown"),
            str(meter.get("multiplier", "")),
            meter.get("project", ""),
        ))

    conn.commit()
    conn.close()
    logger.info(f"主表写入/更新 {len(master_list)} 条记录")


def upsert_monthly_readings(db_path: str, monthly_list: List[Dict[str, Any]]):
    """
    写入/更新月度明细
    使用 INSERT OR REPLACE：同一电表同一月份只保留最新数据
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for reading in monthly_list:
        cursor.execute("""
            INSERT INTO monthly_readings (
                meter_number, month, reading_date,
                peak_sharp, peak, flat, valley, total_kwh,
                price_peak_sharp, price_peak, price_flat, price_valley,
                fee_peak_sharp, fee_peak, fee_flat, fee_valley, total_fee,
                source_file, source_sheet
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(meter_number, month) DO UPDATE SET
                reading_date = excluded.reading_date,
                peak_sharp = COALESCE(excluded.peak_sharp, monthly_readings.peak_sharp),
                peak = COALESCE(excluded.peak, monthly_readings.peak),
                flat = COALESCE(excluded.flat, monthly_readings.flat),
                valley = COALESCE(excluded.valley, monthly_readings.valley),
                total_kwh = COALESCE(excluded.total_kwh, monthly_readings.total_kwh),
                price_peak_sharp = COALESCE(excluded.price_peak_sharp, monthly_readings.price_peak_sharp),
                price_peak = COALESCE(excluded.price_peak, monthly_readings.price_peak),
                price_flat = COALESCE(excluded.price_flat, monthly_readings.price_flat),
                price_valley = COALESCE(excluded.price_valley, monthly_readings.price_valley),
                fee_peak_sharp = COALESCE(excluded.fee_peak_sharp, monthly_readings.fee_peak_sharp),
                fee_peak = COALESCE(excluded.fee_peak, monthly_readings.fee_peak),
                fee_flat = COALESCE(excluded.fee_flat, monthly_readings.fee_flat),
                fee_valley = COALESCE(excluded.fee_valley, monthly_readings.fee_valley),
                total_fee = COALESCE(excluded.total_fee, monthly_readings.total_fee),
                source_file = excluded.source_file,
                source_sheet = excluded.source_sheet
        """, (
            reading.get("meter_number", ""),
            reading.get("month", ""),
            reading.get("reading_date", ""),
            reading.get("peak_sharp"),
            reading.get("peak"),
            reading.get("flat"),
            reading.get("valley"),
            reading.get("total_kwh"),
            reading.get("price_peak_sharp"),
            reading.get("price_peak"),
            reading.get("price_flat"),
            reading.get("price_valley"),
            reading.get("fee_peak_sharp"),
            reading.get("fee_peak"),
            reading.get("fee_flat"),
            reading.get("fee_valley"),
            reading.get("total_fee"),
            reading.get("source_file", ""),
            reading.get("source_sheet", ""),
        ))

    conn.commit()
    conn.close()
    logger.info(f"月度明细写入/更新 {len(monthly_list)} 条记录")


def save_to_database(
    db_path: str,
    master_list: List[Dict[str, Any]],
    monthly_list: List[Dict[str, Any]]
):
    """一键保存到数据库"""
    init_database(db_path)
    upsert_meter_master(db_path, master_list)
    upsert_monthly_readings(db_path, monthly_list)


# ============================================================
# 从数据库读取（供筛选和可视化使用）
# ============================================================

def load_meter_master(db_path: str) -> List[Dict[str, Any]]:
    """从数据库加载电表主表"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM meter_master").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def load_monthly_readings(db_path: str) -> List[Dict[str, Any]]:
    """从数据库加载月度明细"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM monthly_readings ORDER BY month").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# CSV 导出与导入
# ============================================================

def export_to_csv(db_path: str, csv_dir: str):
    """
    将数据库中的数据导出为 CSV 文件
    可在外部编辑后通过 import_from_csv 重新导入
    """
    os.makedirs(csv_dir, exist_ok=True)
    conn = sqlite3.connect(db_path)

    # 导出主表
    df_master = pd.read_sql_query("SELECT * FROM meter_master", conn)
    master_path = os.path.join(csv_dir, "meter_master.csv")
    df_master.to_csv(master_path, index=False, encoding="utf-8-sig")
    logger.info(f"主表导出: {master_path} ({len(df_master)} 条)")

    # 导出月度明细
    df_monthly = pd.read_sql_query(
        "SELECT * FROM monthly_readings ORDER BY meter_number, month", conn
    )
    monthly_path = os.path.join(csv_dir, "monthly_readings.csv")
    df_monthly.to_csv(monthly_path, index=False, encoding="utf-8-sig")
    logger.info(f"月度明细导出: {monthly_path} ({len(df_monthly)} 条)")

    conn.close()


def import_from_csv(db_path: str, csv_dir: str):
    """
    从 CSV 文件重新导入数据到数据库
    用于手工修正后重新加载
    """
    master_path = os.path.join(csv_dir, "meter_master.csv")
    monthly_path = os.path.join(csv_dir, "monthly_readings.csv")

    if os.path.exists(master_path):
        df = pd.read_csv(master_path, encoding="utf-8-sig")
        master_list = df.to_dict("records")
        upsert_meter_master(db_path, master_list)

    if os.path.exists(monthly_path):
        df = pd.read_csv(monthly_path, encoding="utf-8-sig")
        monthly_list = df.to_dict("records")
        upsert_monthly_readings(db_path, monthly_list)

    logger.info("CSV 导入完成")
