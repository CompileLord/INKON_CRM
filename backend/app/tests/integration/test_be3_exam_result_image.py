import io
import pytest
from PIL import Image, ImageFont
from app.services.exam_result_image import ExamResultSvgRenderer, ResvgPngRasterizer
from app.tests.integration.test_be3_exam_result_notifications import sample_card


class TestExamResultImage:
    languages_with_labels: dict[str, tuple[str, str, str, str]] = {
        "tg": ("Натиҷаи имтиҳон", "Имтиҳон", "Холи умумии давра", "14 аз 16 дарс"),
        "ru": ("Результат экзамена", "Экзамен", "Итог периода", "14 из 16 занятий"),
        "en": ("Exam result", "Exam", "Period total", "14 of 16 lessons"),
    }

    @pytest.mark.parametrize("language", ["tg", "ru", "en"])
    def test_svg_contains_localized_labels_and_values(self, language: str) -> None:
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(), language)
        label: str
        for label in self.languages_with_labels[language]:
            assert label in svg_markup
        for expected in ("KITOB", "Ali Valiev", "Python Pro", "45/60", "92/130", "71%", "10.03.2026"):
            assert expected in svg_markup

    def test_period_label_is_localized_per_language(self) -> None:
        renderer: ExamResultSvgRenderer = ExamResultSvgRenderer()
        assert renderer.localize_period_label("Month 1", "en") == "Month 1"
        assert renderer.localize_period_label("Month 1", "ru") == "Месяц 1"
        assert renderer.localize_period_label("Week 3", "tg") == "Ҳафтаи 3"
        assert renderer.localize_period_label("Custom", "ru") == "Custom"

    def test_user_text_is_escaped_and_cannot_inject_markup(self) -> None:
        hostile: str = '&"<script>x</script><image/>'
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(student_name=hostile), "en")
        assert "<script" not in svg_markup
        assert "<image" not in svg_markup
        assert "&lt;script&gt;" in svg_markup
        assert "&amp;" in svg_markup
        ResvgPngRasterizer().rasterize(svg_markup)

    def test_control_characters_are_stripped_so_svg_stays_parseable(self) -> None:
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(student_name="Ali\x00\x0bVal"), "en")
        assert "\x00" not in svg_markup and "\x0b" not in svg_markup
        assert ResvgPngRasterizer().rasterize(svg_markup).startswith(b"\x89PNG")

    def test_png_is_valid_square_image_in_brand_colors(self) -> None:
        svg_markup: str = ExamResultSvgRenderer().render(sample_card(), "ru")
        png_bytes: bytes = ResvgPngRasterizer().rasterize(svg_markup)
        assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        image: Image.Image = Image.open(io.BytesIO(png_bytes))
        image.load()
        assert image.size == (1080, 1080)
        assert image.convert("RGB").getpixel((540, 100)) == (8, 61, 145)

    def test_bundled_font_has_real_glyphs_for_tajik_and_cyrillic_letters(self) -> None:
        font: ImageFont.FreeTypeFont = ImageFont.truetype(str(ResvgPngRasterizer.font_directory / "OpenSans-Bold.ttf"), 64)
        missing_glyph: bytes = bytes(font.getmask(""))
        letter: str
        for letter in "ӣӯҳҷқғӢӮҲҶҚҒжщыю":
            assert bytes(font.getmask(letter)) != missing_glyph

    def test_tajik_text_changes_rendered_pixels_compared_to_missing_glyphs(self) -> None:
        rasterizer: ResvgPngRasterizer = ResvgPngRasterizer()
        renderer: ExamResultSvgRenderer = ExamResultSvgRenderer()
        tajik_png: bytes = rasterizer.rasterize(renderer.render(sample_card("ӣӯҳҷқғ"), "tg"))
        missing_png: bytes = rasterizer.rasterize(renderer.render(sample_card(""), "tg"))
        assert tajik_png != missing_png

    def test_caption_is_localized(self) -> None:
        renderer: ExamResultSvgRenderer = ExamResultSvgRenderer()
        assert renderer.build_caption(sample_card(), "ru") == "Результат экзамена Ali Valiev: Python Pro, Месяц 1."
        assert renderer.build_caption(sample_card(), "en") == "Exam result for Ali Valiev: Python Pro, Month 1."
