"""
项目与用户编号筛选模块
======================
功能：
1. 按项目名称筛选电表及其抄表数据
2. 按用户编号筛选所有关联电表及历史抄表数据
3. 提供函数式接口，可直接在其他模块中调用
"""

import logging
from typing import List, Dict, Any, Optional

import pandas as pd

logger = logging.getLogger(__name__)


def filter_by_project(
    meter_master: List[Dict[str, Any]],
    monthly_readings: List[Dict[str, Any]],
    project_name: str
) -> tuple:
    """
    按项目名称筛选
    返回: (匹配的电表主表列表, 匹配的月度明细列表)

    支持模糊匹配：项目名中包含给定关键词即匹配
    """
    # 筛选主表
    matched_meters = [
        m for m in meter_master
        if project_name in (m.get("project") or "")
    ]
    matched_meter_numbers = {m["meter_number"] for m in matched_meters}

    # 筛选月度明细
    matched_monthly = [
        r for r in monthly_readings
        if r.get("meter_number") in matched_meter_numbers
    ]

    logger.info(
        f"项目筛选 '{project_name}': "
        f"{len(matched_meters)} 个电表, {len(matched_monthly)} 条月度数据"
    )
    return matched_meters, matched_monthly


def filter_by_user_id(
    meter_master: List[Dict[str, Any]],
    monthly_readings: List[Dict[str, Any]],
    user_id: str
) -> tuple:
    """
    按用户编号筛选：返回该用户编号下所有关联的电表及历史抄表数据
    """
    matched_meters = [
        m for m in meter_master
        if str(m.get("user_id", "")).strip() == str(user_id).strip()
    ]
    matched_meter_numbers = {m["meter_number"] for m in matched_meters}

    matched_monthly = [
        r for r in monthly_readings
        if r.get("meter_number") in matched_meter_numbers
    ]

    logger.info(
        f"用户编号筛选 '{user_id}': "
        f"{len(matched_meters)} 个电表, {len(matched_monthly)} 条月度数据"
    )
    return matched_meters, matched_monthly


def filter_by_meter_number(
    meter_master: List[Dict[str, Any]],
    monthly_readings: List[Dict[str, Any]],
    meter_number: str
) -> tuple:
    """按电表号精确筛选"""
    matched_meters = [
        m for m in meter_master
        if m.get("meter_number") == meter_number
    ]
    matched_monthly = [
        r for r in monthly_readings
        if r.get("meter_number") == meter_number
    ]
    return matched_meters, matched_monthly


def list_projects(meter_master: List[Dict[str, Any]]) -> List[str]:
    """列出所有项目名称"""
    projects = set()
    for m in meter_master:
        p = m.get("project", "").strip()
        if p:
            projects.add(p)
    return sorted(projects)


def list_user_ids(meter_master: List[Dict[str, Any]]) -> List[str]:
    """列出所有用户编号"""
    user_ids = set()
    for m in meter_master:
        uid = str(m.get("user_id", "")).strip()
        if uid:
            user_ids.add(uid)
    return sorted(user_ids)


def summary_report(
    meter_master: List[Dict[str, Any]],
    monthly_readings: List[Dict[str, Any]]
) -> str:
    """生成数据摘要报告"""
    lines = [
        "=" * 60,
        "电费数据摘要报告",
        "=" * 60,
        f"电表总数: {len(meter_master)}",
        f"月度记录总数: {len(monthly_readings)}",
        f"项目列表: {', '.join(list_projects(meter_master)) or '无'}",
        f"用户编号列表: {', '.join(list_user_ids(meter_master)) or '无'}",
        "",
    ]

    # 按项目分组统计
    from collections import Counter
    project_counter = Counter(m.get("project", "未分类") for m in meter_master)
    lines.append("按项目统计电表数:")
    for project, count in project_counter.most_common():
        lines.append(f"  {project}: {count} 个电表")

    # 按电表类型统计
    type_counter = Counter(m.get("meter_type", "unknown") for m in meter_master)
    lines.append("\n按电表类型统计:")
    for mtype, count in type_counter.most_common():
        type_label = {"grid_feed": "上网表", "generation": "发电表"}.get(mtype, mtype)
        lines.append(f"  {type_label}: {count} 个")

    lines.append("=" * 60)
    return "\n".join(lines)
