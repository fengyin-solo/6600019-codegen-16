"""Seismic waveform processing service."""
import numpy as np
import time
import uuid
import asyncio
from typing import List, Dict, Any, Optional
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    PARSING = "parsing"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class ProcessingStage:
    UPLOADING = {"name": "上传文件", "progress": 10}
    PARSING = {"name": "解析波形", "progress": 40}
    ANALYZING = {"name": "震相分析", "progress": 70}
    COMPLETED = {"name": "处理完成", "progress": 100}


_tasks: Dict[str, Dict[str, Any]] = {}


def create_task(filename: str, file_size: int) -> str:
    """Create a new processing task."""
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {
        "id": task_id,
        "filename": filename,
        "file_size": file_size,
        "status": TaskStatus.PENDING,
        "stage": ProcessingStage.UPLOADING["name"],
        "progress": 0,
        "message": "任务已创建，等待处理...",
        "result": None,
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    return task_id


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    """Get task status by ID."""
    return _tasks.get(task_id)


def _update_progress(task_id: str, status: TaskStatus, stage: Dict[str, Any], message: str):
    """Update task progress."""
    if task_id in _tasks:
        _tasks[task_id].update({
            "status": status,
            "stage": stage["name"],
            "progress": stage["progress"],
            "message": message,
            "updated_at": time.time(),
        })


def _set_result(task_id: str, result: Dict[str, Any]):
    """Set task completion result."""
    if task_id in _tasks:
        _tasks[task_id].update({
            "status": TaskStatus.COMPLETED,
            "stage": ProcessingStage.COMPLETED["name"],
            "progress": ProcessingStage.COMPLETED["progress"],
            "message": "处理完成",
            "result": result,
            "updated_at": time.time(),
        })


def _set_error(task_id: str, error: str):
    """Set task error."""
    if task_id in _tasks:
        _tasks[task_id].update({
            "status": TaskStatus.FAILED,
            "message": f"处理失败: {error}",
            "updated_at": time.time(),
        })


def generate_mock_waveform(duration: int = 60, sr: int = 100) -> Dict[str, Any]:
    """Generate synthetic seismic waveform with P and S arrivals."""
    n = sr * duration
    t = np.linspace(0, duration, n)

    # Background noise
    bhz = np.random.normal(0, 0.01, n)
    bhn = np.random.normal(0, 0.01, n)
    bhe = np.random.normal(0, 0.01, n)

    # P-wave (t=10s, 8Hz)
    p_mask = (t > 10) & (t < 18)
    p_amp = 0.8 * np.exp(-((t[p_mask] - 12) ** 2) / 8)
    bhz[p_mask] += p_amp * np.sin(2 * np.pi * 8 * t[p_mask])

    # S-wave (t=22s, 4Hz)
    s_mask = (t > 22) & (t < 40)
    s_amp = 1.5 * np.exp(-((t[s_mask] - 28) ** 2) / 30)
    bhe[s_mask] += s_amp * np.sin(2 * np.pi * 4 * t[s_mask])

    return {
        "time": t.tolist(),
        "bhz": bhz.tolist(),
        "bhn": bhn.tolist(),
        "bhe": bhe.tolist(),
        "samplingRate": sr,
    }


def sta_lta_pick(data: List[float], sr: int,
                 sta_sec: float = 1.0, lta_sec: float = 10.0,
                 threshold: float = 3.5) -> List[Dict[str, Any]]:
    """STA/LTA automatic phase picker."""
    arr = np.array(data)
    sta_len = int(sta_sec * sr)
    lta_len = int(lta_sec * sr)

    # Compute STA/LTA ratio
    sq = arr ** 2
    sta = np.convolve(sq, np.ones(sta_len) / sta_len, mode='valid')
    lta = np.convolve(sq, np.ones(lta_len) / lta_len, mode='valid')

    # Align lengths
    min_len = min(len(sta), len(lta))
    sta = sta[:min_len]
    lta = lta[:min_len]

    ratio = np.where(lta > 0, sta / lta, 0)
    picks = []
    last_pick = -999

    for i in range(len(ratio)):
        if ratio[i] > threshold and (i / sr - last_pick) > 2:
            t = (i + lta_len) / sr
            picks.append({
                "id": f"pick_{i}",
                "type": "P" if not picks else "S",
                "time": round(t, 2),
                "confidence": round(min(1.0, ratio[i] / 10), 2),
                "method": "STA/LTA",
            })
            last_pick = t

    return picks


def process_waveform(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Process uploaded waveform file.
    In production, use ObsPy to read SAC/miniSEED:
        from obspy import read
        st = read(BytesIO(file_bytes))
    """
    waveform = generate_mock_waveform()
    picks = sta_lta_pick(waveform["bhz"], waveform["samplingRate"])
    return {"waveform": waveform, "picks": picks}


async def process_waveform_async(task_id: str, file_bytes: bytes, filename: str):
    """Process waveform asynchronously with progress tracking."""
    try:
        _update_progress(task_id, TaskStatus.UPLOADING, ProcessingStage.UPLOADING,
                          f"正在上传文件: {filename}")
        await asyncio.sleep(0.8)

        file_size_mb = len(file_bytes) / (1024 / 1024)
        _update_progress(task_id, TaskStatus.PARSING, ProcessingStage.PARSING,
                          f"正在解析波形数据 ({file_size_mb:.1f} MB")
        await asyncio.sleep(1.2)

        _update_progress(task_id, TaskStatus.ANALYZING, ProcessingStage.ANALYZING,
                          "正在运行 STA/LTA 震相拾取分析...")
        await asyncio.sleep(1.0)

        result = process_waveform(file_bytes, filename)
        _set_result(task_id, result)

    except Exception as e:
        _set_error(task_id, str(e))
