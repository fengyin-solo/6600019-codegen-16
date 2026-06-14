from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
import asyncio
from app.services.seismic_service import (
    process_waveform,
    process_waveform_async,
    create_task,
    get_task,
    TaskStatus,
)

router = APIRouter()


def run_async_task(coro):
    """Run async task in a new event loop for background tasks."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(coro)
    finally:
        loop.close()


@router.post("/waveform/upload")
async def upload_waveform(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload SAC/miniSEED file and run analysis asynchronously with progress tracking."""
    content = await file.read()
    file_size = len(content)
    filename = file.filename or "unknown"

    task_id = create_task(filename, file_size)

    background_tasks.add_task(run_async_task, process_waveform_async(task_id, content, filename))

    return {
        "task_id": task_id,
        "filename": filename,
        "file_size": file_size,
        "message": "文件上传成功，正在后台处理...",
    }


@router.get("/waveform/task/{task_id}")
async def get_task_status(task_id: str):
    """Get processing task status and progress."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    response = {
        "id": task["id"],
        "filename": task["filename"],
        "file_size": task["file_size"],
        "status": task["status"],
        "stage": task["stage"],
        "progress": task["progress"],
        "message": task["message"],
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
    }

    if task["status"] == TaskStatus.COMPLETED and task["result"]:
        response["result"] = task["result"]

    return response


@router.post("/waveform/upload-sync")
async def upload_waveform_sync(file: UploadFile = File(...)):
    """Upload SAC/miniSEED file and run analysis synchronously (legacy)."""
    content = await file.read()
    result = process_waveform(content, file.filename or "unknown")
    return result


@router.get("/waveform/stations")
def get_stations():
    """Get station list."""
    return [
        {"id": "STA01", "name": "BJI", "latitude": 39.9, "longitude": 116.4, "elevation": 45},
        {"id": "STA02", "name": "SSE", "latitude": 31.2, "longitude": 121.5, "elevation": 10},
    ]


@router.get("/waveform/events")
def get_events():
    """Get seismic event catalog."""
    return [
        {"id": "1", "magnitude": 4.2, "depth": 12.5, "location": "四川雅安"},
        {"id": "2", "magnitude": 3.8, "depth": 8.3, "location": "云南大理"},
    ]
