"""
可视化模块
==========
功能：
1. 折线图：单表或多表的月度尖峰平谷电量趋势
2. 柱状图：上网表与发电表的电量及电费对比
3. 支持按项目或用户编号过滤后绘图
4. 数据来源于 SQLite / CSV，修改后刷新即可

使用 Matplotlib 生成静态图表，保存到 charts 目录
"""

import os
import logging
from typing import List, Dict, Any, Optional

import pandas as pd
import matplotlib
matplotlib.use("Agg")  # 无头模式，适合服务器/脚本环境
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)


def _setup_chinese_font(config: dict):
    """配置中文字体支持"""
    font_family = config.get("visualization", {}).get("font_family", "SimHei")
    plt.rcParams["font.sans-serif"] = [font_family, "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False


def _ensure_output_dir(config: dict) -> str:
    """确保图表输出目录存在"""
    output_dir = config.get("visualization", {}).get("output_dir", "./data/charts")
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


# ============================================================
# 折线图：月度电量趋势
# ============================================================

def plot_monthly_trend(
    monthly_readings: List[Dict[str, Any]],
    meter_master: List[Dict[str, Any]],
    config: dict,
    meter_numbers: Optional[List[str]] = None,
    title_suffix: str = "",
) -> str:
    """
    绘制月度尖峰/峰/平/谷电量趋势折线图

    参数:
        monthly_readings: 月度明细数据
        meter_master: 电表主表（用于获取电表类型）
        config: 配置
        meter_numbers: 要绘制的电表号列表（None=全部）
        title_suffix: 标题后缀（如项目名、用户编号）

    返回: 图表保存路径
    """
    _setup_chinese_font(config)
    output_dir = _ensure_output_dir(config)

    df = pd.DataFrame(monthly_readings)
    if df.empty:
        logger.warning("无月度数据，跳过绘图")
        return ""

    if meter_numbers:
        df = df[df["meter_number"].isin(meter_numbers)]

    if df.empty:
        logger.warning("筛选后无数据，跳过绘图")
        return ""

    colors = config.get("visualization", {}).get(
        "line_colors", ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]
    )

    fig, axes = plt.subplots(2, 1, figsize=(14, 10), sharex=True)

    # --- 电量趋势 ---
    ax1 = axes[0]
    for i, meter_num in enumerate(df["meter_number"].unique()):
        meter_df = df[df["meter_number"] == meter_num].sort_values("month")
        months = meter_df["month"].tolist()
        color_idx = i % len(colors)

        for field, label, ls in [
            ("peak_sharp", "尖峰", "-"),
            ("peak", "峰", "--"),
            ("flat", "平", "-."),
            ("valley", "谷", ":"),
        ]:
            values = pd.to_numeric(meter_df[field], errors="coerce").tolist()
            if any(v == v for v in values):  # 至少有一个非 NaN
                ax1.plot(
                    months, values,
                    label=f"{meter_num}-{label}",
                    linestyle=ls, color=colors[color_idx],
                    marker="o", markersize=4,
                    alpha=0.7 + 0.1 * (3 - ["-", "--", "-.", ":"].index(ls))
                )

    ax1.set_ylabel("电量 (kWh)")
    ax1.set_title(f"月度尖峰/峰/平/谷电量趋势 {title_suffix}")
    ax1.legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=8)
    ax1.grid(True, alpha=0.3)

    # --- 总电量趋势 ---
    ax2 = axes[1]
    for i, meter_num in enumerate(df["meter_number"].unique()):
        meter_df = df[df["meter_number"] == meter_num].sort_values("month")
        months = meter_df["month"].tolist()
        total = pd.to_numeric(meter_df["total_kwh"], errors="coerce").tolist()
        ax2.plot(
            months, total,
            label=meter_num,
            color=colors[i % len(colors)],
            marker="s", linewidth=2
        )

    ax2.set_xlabel("月份")
    ax2.set_ylabel("总电量 (kWh)")
    ax2.set_title(f"月度总电量趋势 {title_suffix}")
    ax2.legend(bbox_to_anchor=(1.05, 1), loc="upper left", fontsize=8)
    ax2.grid(True, alpha=0.3)

    plt.xticks(rotation=45)
    plt.tight_layout()

    filename = f"trend_{title_suffix or 'all'}.png".replace(" ", "_")
    filepath = os.path.join(output_dir, filename)
    fig.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    logger.info(f"趋势图已保存: {filepath}")
    return filepath


# ============================================================
# 柱状图：上网表 vs 发电表对比
# ============================================================

def plot_meter_type_comparison(
    monthly_readings: List[Dict[str, Any]],
    meter_master: List[Dict[str, Any]],
    config: dict,
    target_month: Optional[str] = None,
    title_suffix: str = "",
) -> str:
    """
    绘制上网表与发电表的电量及电费对比柱状图

    参数:
        target_month: 指定月份（None=所有月份汇总）
    """
    _setup_chinese_font(config)
    output_dir = _ensure_output_dir(config)

    # 构建电表类型映射
    type_map = {m["meter_number"]: m.get("meter_type", "unknown") for m in meter_master}

    df = pd.DataFrame(monthly_readings)
    if df.empty:
        logger.warning("无数据，跳过绘图")
        return ""

    if target_month:
        df = df[df["month"] == target_month]

    # 标记电表类型
    df["meter_type"] = df["meter_number"].map(type_map).fillna("unknown")

    # 按类型汇总
    type_labels = {"grid_feed": "上网表", "generation": "发电表", "unknown": "未知"}
    numeric_cols = ["peak_sharp", "peak", "flat", "valley", "total_kwh",
                    "fee_peak_sharp", "fee_peak", "fee_flat", "fee_valley", "total_fee"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    grouped = df.groupby("meter_type")[numeric_cols].sum()

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7))

    # --- 电量对比 ---
    kwh_cols = ["peak_sharp", "peak", "flat", "valley"]
    kwh_labels = ["尖峰", "峰", "平", "谷"]

    x_labels = [type_labels.get(t, t) for t in grouped.index]
    x_pos = range(len(x_labels))
    bar_width = 0.18

    for i, (col, label) in enumerate(zip(kwh_cols, kwh_labels)):
        if col in grouped.columns:
            vals = grouped[col].tolist()
            positions = [p + i * bar_width for p in x_pos]
            ax1.bar(positions, vals, bar_width, label=label, alpha=0.85)

    ax1.set_xticks([p + bar_width * 1.5 for p in x_pos])
    ax1.set_xticklabels(x_labels)
    ax1.set_ylabel("电量 (kWh)")
    ax1.set_title(f"电量对比 {target_month or '全部'} {title_suffix}")
    ax1.legend()
    ax1.grid(True, alpha=0.3, axis="y")

    # --- 电费对比 ---
    fee_cols = ["fee_peak_sharp", "fee_peak", "fee_flat", "fee_valley"]
    fee_labels = ["尖峰电费", "峰电费", "平电费", "谷电费"]

    for i, (col, label) in enumerate(zip(fee_cols, fee_labels)):
        if col in grouped.columns:
            vals = grouped[col].tolist()
            positions = [p + i * bar_width for p in x_pos]
            ax2.bar(positions, vals, bar_width, label=label, alpha=0.85)

    ax2.set_xticks([p + bar_width * 1.5 for p in x_pos])
    ax2.set_xticklabels(x_labels)
    ax2.set_ylabel("电费 (元)")
    ax2.set_title(f"电费对比 {target_month or '全部'} {title_suffix}")
    ax2.legend()
    ax2.grid(True, alpha=0.3, axis="y")

    plt.tight_layout()

    filename = f"comparison_{target_month or 'all'}_{title_suffix or 'all'}.png".replace(" ", "_")
    filepath = os.path.join(output_dir, filename)
    fig.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    logger.info(f"对比图已保存: {filepath}")
    return filepath


# ============================================================
# 主绘图入口
# ============================================================

def generate_all_charts(
    meter_master: List[Dict[str, Any]],
    monthly_readings: List[Dict[str, Any]],
    config: dict,
    project_filter: Optional[str] = None,
    user_id_filter: Optional[str] = None,
):
    """
    一键生成所有图表
    支持按项目或用户编号过滤后绘图
    """
    from data_filter import filter_by_project, filter_by_user_id

    suffix = ""
    masters = meter_master
    monthly = monthly_readings

    if project_filter:
        masters, monthly = filter_by_project(meter_master, monthly_readings, project_filter)
        suffix = f"项目_{project_filter}"
    elif user_id_filter:
        masters, monthly = filter_by_user_id(meter_master, monthly_readings, user_id_filter)
        suffix = f"用户_{user_id_filter}"

    # 趋势图
    plot_monthly_trend(monthly, masters, config, title_suffix=suffix)

    # 对比图（全部月份汇总）
    plot_meter_type_comparison(monthly, masters, config, title_suffix=suffix)

    # 对比图（按月分别绘制）
    months = set(r.get("month", "") for r in monthly if r.get("month"))
    for month in sorted(months):
        plot_meter_type_comparison(monthly, masters, config, target_month=month, title_suffix=suffix)

    logger.info("所有图表生成完成")
