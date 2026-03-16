"""
数据关联与清洗模块
==================
功能：
1. 以用户编号为键，将抄表数据与 OCR 提取的单价合并
2. 按电表建立"主表（固定信息）+ 月度明细（变动数据）"结构
3. 计算每月各时段电费 = 电量 × 单价
"""

import logging
from typing import List, Dict, Any, Tuple
from collections import defaultdict

import pandas as pd

logger = logging.getLogger(__name__)


def merge_prices_with_readings(
    meter_records: List[Dict[str, Any]],
    price_records: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    将 OCR 提取的单价与电表抄表数据合并
    关联键: user_id（用户编号）

    逻辑：
    1. 建立 user_id -> prices 的映射（同一用户编号可能有多次 OCR 结果，取最新的）
    2. 遍历抄表记录，根据 user_id 查找对应单价并写入
    """
    # 按 user_id 聚合单价（后出现的覆盖前面的）
    user_price_map: Dict[str, Dict[str, float]] = {}
    for pr in price_records:
        uid = pr.get("user_id")
        if uid and pr.get("prices"):
            user_price_map[uid] = pr["prices"]

    logger.info(f"单价映射: {len(user_price_map)} 个用户编号")

    # 合并到抄表记录
    merged_count = 0
    for record in meter_records:
        uid = record.get("user_id")
        if uid and uid in user_price_map:
            prices = user_price_map[uid]
            record["price_peak_sharp"] = prices.get("peak_sharp")
            record["price_peak"] = prices.get("peak")
            record["price_flat"] = prices.get("flat")
            record["price_valley"] = prices.get("valley")
            merged_count += 1

            # 计算各时段电费
            _calculate_fees(record)

    logger.info(f"已合并单价的记录数: {merged_count}/{len(meter_records)}")
    return meter_records


def _calculate_fees(record: Dict[str, Any]):
    """
    计算各时段电费 = 电量 × 单价
    结果写入 record 中的 fee_* 字段
    """
    fee_map = {
        ("peak_sharp", "price_peak_sharp"): "fee_peak_sharp",
        ("peak", "price_peak"): "fee_peak",
        ("flat", "price_flat"): "fee_flat",
        ("valley", "price_valley"): "fee_valley",
    }

    total_fee = 0.0
    for (kwh_key, price_key), fee_key in fee_map.items():
        kwh = record.get(kwh_key)
        price = record.get(price_key)
        if kwh is not None and price is not None:
            try:
                fee = float(kwh) * float(price)
                record[fee_key] = round(fee, 2)
                total_fee += fee
            except (ValueError, TypeError):
                record[fee_key] = None

    record["total_fee"] = round(total_fee, 2) if total_fee > 0 else None


def build_meter_master_and_monthly(
    meter_records: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    将扁平的电表记录拆分为：
    1. 主表 (meter_master): 每个电表的固定信息（只存一次）
       - meter_number, asset_number, user_id, meter_type, multiplier, project
    2. 月度明细 (monthly_readings): 每月变动的抄表与费用数据
       - meter_number, month, peak_sharp, peak, flat, valley, total_kwh,
         price_*, fee_*, reading_date

    去重逻辑：以 meter_number 为主键
    """
    # --- 主表去重 ---
    master_map: Dict[str, Dict[str, Any]] = {}
    monthly_list: List[Dict[str, Any]] = []

    for record in meter_records:
        mn = record.get("meter_number")
        if not mn:
            continue

        # 更新主表（固定信息取最新的非空值）
        if mn not in master_map:
            master_map[mn] = {
                "meter_number": mn,
                "asset_number": "",
                "user_id": "",
                "meter_type": "unknown",
                "multiplier": "",
                "project": "",
            }

        master = master_map[mn]
        for key in ["asset_number", "user_id", "meter_type", "multiplier", "project"]:
            new_val = record.get(key)
            if new_val and str(new_val).strip() and new_val != "unknown":
                master[key] = str(new_val).strip()

        # --- 月度明细 ---
        monthly = {
            "meter_number": mn,
            "month": record.get("month", ""),
            "reading_date": record.get("reading_date", ""),
            "peak_sharp": record.get("peak_sharp"),
            "peak": record.get("peak"),
            "flat": record.get("flat"),
            "valley": record.get("valley"),
            "total_kwh": record.get("total_kwh"),
            "price_peak_sharp": record.get("price_peak_sharp"),
            "price_peak": record.get("price_peak"),
            "price_flat": record.get("price_flat"),
            "price_valley": record.get("price_valley"),
            "fee_peak_sharp": record.get("fee_peak_sharp"),
            "fee_peak": record.get("fee_peak"),
            "fee_flat": record.get("fee_flat"),
            "fee_valley": record.get("fee_valley"),
            "total_fee": record.get("total_fee"),
            "source_file": record.get("source_file", ""),
            "source_sheet": record.get("source_sheet", ""),
        }
        monthly_list.append(monthly)

    master_list = list(master_map.values())
    logger.info(f"主表: {len(master_list)} 个电表 | 月度明细: {len(monthly_list)} 条")
    return master_list, monthly_list


def deduplicate_monthly(monthly_readings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    对月度明细去重：同一电表、同一月份只保留一条
    如果有重复，优先保留数据更完整的那条（非空字段更多）
    """
    best: Dict[str, Dict[str, Any]] = {}

    for reading in monthly_readings:
        key = f"{reading.get('meter_number')}_{reading.get('month')}"
        if key not in best:
            best[key] = reading
        else:
            # 比较非空字段数量
            existing_score = sum(1 for v in best[key].values() if v is not None and str(v).strip())
            new_score = sum(1 for v in reading.values() if v is not None and str(v).strip())
            if new_score > existing_score:
                best[key] = reading

    result = list(best.values())
    logger.info(f"月度明细去重: {len(monthly_readings)} -> {len(result)} 条")
    return result


def clean_and_structure(
    meter_records: List[Dict[str, Any]],
    price_records: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    主清洗流程:
    1. 合并单价
    2. 拆分主表 + 月度明细
    3. 去重
    返回 (meter_master, monthly_readings)
    """
    # Step 1: 合并单价
    merged = merge_prices_with_readings(meter_records, price_records)

    # Step 2: 拆分
    master, monthly = build_meter_master_and_monthly(merged)

    # Step 3: 去重
    monthly = deduplicate_monthly(monthly)

    return master, monthly
