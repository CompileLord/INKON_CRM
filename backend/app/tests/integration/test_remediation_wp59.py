import ast
from pathlib import Path

from app.models import course_mentor_history
from app.models.course_mentor_history import CourseMentorHistory


class TestCourseMentorHistoryModuleCleanup:
    def test_module_source_parses_without_stray_statements(self) -> None:
        module_source: str = Path(course_mentor_history.__file__).read_text()
        parsed_module: ast.Module = ast.parse(module_source)
        stray_expression_nodes: list[ast.stmt] = [
            node for node in parsed_module.body if isinstance(node, ast.Expr)
        ]
        assert stray_expression_nodes == []
        assert "Length: 792" not in module_source

    def test_mapping_and_relationships_are_preserved(self) -> None:
        mapped_column_names: set[str] = {column.name for column in CourseMentorHistory.__table__.columns}
        assert "assigned_to" in mapped_column_names
        assert {"course", "mentor"} <= set(CourseMentorHistory.__mapper__.relationships.keys())
