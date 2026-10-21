import threading
from datetime import timedelta

import pytest

from app.services.exam_result_image import ExamResultCardData, ExamResultSvgRenderer
from app.tests.integration.test_be3_exam_result_notifications import (
    BASE_TIME, DELAY_SECONDS, MutableClock, RecordingSender, Scenario,
    register_edit, scenario,
)
from app.tests.conftest import TestingSessionLocal
from app.workers.exam_result_delivery import ExamResultDeliveryWorker


class ThreadRecordingRenderer(ExamResultSvgRenderer):
    def __init__(self) -> None:
        super().__init__()
        self.thread_id: int | None = None

    def render(self, data: ExamResultCardData, language: str) -> str:
        self.thread_id = threading.get_ident()
        return super().render(data, language)


class ThreadRecordingRasterizer:
    def __init__(self) -> None:
        self.thread_id: int | None = None

    def rasterize(self, svg_markup: str) -> bytes:
        self.thread_id = threading.get_ident()
        assert "<svg" in svg_markup
        return b"synthetic-png"


@pytest.mark.asyncio
async def test_delivery_offloads_rendering_and_rasterization(scenario: Scenario) -> None:
    await register_edit(scenario, 0, 45, BASE_TIME)
    event_loop_thread: int = threading.get_ident()
    renderer: ThreadRecordingRenderer = ThreadRecordingRenderer()
    rasterizer: ThreadRecordingRasterizer = ThreadRecordingRasterizer()
    sender: RecordingSender = RecordingSender()
    worker: ExamResultDeliveryWorker = ExamResultDeliveryWorker(
        TestingSessionLocal, sender, renderer=renderer, rasterizer=rasterizer,
        clock=MutableClock(BASE_TIME + timedelta(seconds=DELAY_SECONDS)),
    )
    assert await worker.run_once() == 1
    assert len(sender.photos) == 1
    assert sender.photos[0][1] == b"synthetic-png"
    assert renderer.thread_id is not None
    assert renderer.thread_id != event_loop_thread
    assert rasterizer.thread_id == renderer.thread_id
