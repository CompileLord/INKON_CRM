import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import ClassVar
from xml.sax.saxutils import escape
from typing_extensions import Protocol
import resvg_py
from app.core.scoring import ScoringPolicy
from app.telegram_bot.messages import TelegramMessageCatalog


@dataclass(frozen=True)
class ExamResultCardData:
    student_name: str
    course_title: str
    period_label: str
    exam_score: int
    exam_max_score: int
    total_score: int
    max_period_score: int
    attendance_count: int
    total_lessons: int
    rendered_at: datetime


class SvgRasterizer(Protocol):
    def rasterize(self, svg_markup: str) -> bytes:
        ...


class ExamResultSvgRenderer:
    canvas_size: ClassVar[int] = 1080
    brand_blue: ClassVar[str] = "#083d91"
    brand_orange: ClassVar[str] = "#f58220"
    ink: ClassVar[str] = "#14233b"
    muted: ClassVar[str] = "#52647b"
    cream: ClassVar[str] = "#f5f8fd"
    card: ClassVar[str] = "#ffffff"
    border: ClassVar[str] = "#d7e0ee"
    font_family: ClassVar[str] = "Open Sans"
    period_pattern: ClassVar[re.Pattern[str]] = re.compile(r"^(Week|Month)\s+(\d+)$", re.IGNORECASE)
    invalid_xml_characters: ClassVar[re.Pattern[str]] = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")

    def __init__(self, catalog: TelegramMessageCatalog | None = None) -> None:
        self._catalog: TelegramMessageCatalog = catalog or TelegramMessageCatalog()

    def localize_period_label(self, period_label: str, language: str) -> str:
        match: re.Match[str] | None = self.period_pattern.match(period_label.strip())
        if match is None:
            return period_label
        key: str = "period_week" if match.group(1).lower() == "week" else "period_month"
        return self._catalog.render(key, language, number=match.group(2))

    def format_date(self, moment: datetime) -> str:
        return moment.strftime("%d.%m.%Y")

    def build_caption(self, data: ExamResultCardData, language: str) -> str:
        return self._catalog.render(
            "exam_caption",
            language,
            student_name=data.student_name,
            course_title=data.course_title,
            period_label=self.localize_period_label(data.period_label, language),
        )

    def render(self, data: ExamResultCardData, language: str) -> str:
        period_label: str = self.localize_period_label(data.period_label, language)
        percentage: str = f"{round(ScoringPolicy.percentage(data.total_score, data.max_period_score))}%"
        attendance: str = self._catalog.render(
            "attendance_value", language, attended=str(data.attendance_count), total=str(data.total_lessons)
        )
        size: int = self.canvas_size
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" fill="{self.cream}"/>'
            f'<rect x="60" y="60" width="960" height="960" rx="36" fill="{self.card}" stroke="{self.border}" stroke-width="2"/>'
            f'<path d="M96 60 H984 A36 36 0 0 1 1020 96 V230 H60 V96 A36 36 0 0 1 96 60 Z" fill="{self.brand_blue}"/>'
            f'<rect x="60" y="230" width="960" height="10" fill="{self.brand_orange}"/>'
            f'{self._text(110, 160, "KITOB", 64, "#ffffff", "700", letter_spacing=6)}'
            f'{self._text(970, 156, self._catalog.render("exam_card_title", language), 34, "#ffffff", "400", anchor="end", max_chars=24)}'
            f'{self._text(110, 340, data.student_name, 56, self.ink, "700", max_chars=26)}'
            f'{self._text(110, 396, data.course_title, 36, self.muted, "400", max_chars=40)}'
            f'<rect x="110" y="428" width="{self._pill_width(period_label)}" height="54" rx="27" fill="{self.cream}" stroke="{self.border}" stroke-width="2"/>'
            f'{self._text(110 + self._pill_width(period_label) // 2, 466, period_label, 30, self.brand_blue, "700", anchor="middle", max_chars=22)}'
            f'{self._text(540, 570, self._catalog.render("exam_score_label", language), 34, self.muted, "400", anchor="middle", max_chars=24)}'
            f'{self._text(540, 705, f"{data.exam_score}/{data.exam_max_score}", 150, self.brand_blue, "700", anchor="middle")}'
            f'<rect x="110" y="750" width="860" height="2" fill="{self.border}"/>'
            f'{self._text(110, 815, self._catalog.render("period_total_label", language), 32, self.muted, "400", max_chars=26)}'
            f'{self._text(970, 815, f"{data.total_score}/{data.max_period_score}", 48, self.ink, "700", anchor="end")}'
            f'{self._text(970, 858, percentage, 28, self.muted, "400", anchor="end")}'
            f'{self._text(110, 925, self._catalog.render("attendance_label", language), 32, self.muted, "400", max_chars=26)}'
            f'{self._text(970, 925, attendance, 32, self.ink, "700", anchor="end", max_chars=24)}'
            f'{self._text(970, 985, self.format_date(data.rendered_at), 26, self.muted, "400", anchor="end")}'
            "</svg>"
        )

    def _pill_width(self, period_label: str) -> int:
        return max(160, 24 * 2 + 17 * min(len(period_label), 22))

    def _text(
        self,
        x: int,
        y: int,
        content: str,
        font_size: int,
        fill: str,
        weight: str,
        anchor: str = "start",
        max_chars: int | None = None,
        letter_spacing: int = 0,
    ) -> str:
        sanitized: str = self.invalid_xml_characters.sub("", content)
        if max_chars is not None and len(sanitized) > max_chars:
            sanitized = sanitized[: max_chars - 1].rstrip() + "…"
        return (
            f'<text x="{x}" y="{y}" font-family="{self.font_family}, sans-serif" font-size="{font_size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{letter_spacing}">'
            f"{escape(sanitized)}</text>"
        )


class ResvgPngRasterizer:
    font_directory: ClassVar[Path] = Path(__file__).resolve().parent.parent / "assets" / "fonts"

    def rasterize(self, svg_markup: str) -> bytes:
        return bytes(
            resvg_py.svg_to_bytes(
                svg_string=svg_markup,
                skip_system_fonts=True,
                font_files=[
                    str(self.font_directory / "OpenSans-Regular.ttf"),
                    str(self.font_directory / "OpenSans-Bold.ttf"),
                ],
                font_family=ExamResultSvgRenderer.font_family,
                sans_serif_family=ExamResultSvgRenderer.font_family,
            )
        )
