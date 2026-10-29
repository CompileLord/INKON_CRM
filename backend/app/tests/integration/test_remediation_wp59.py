from app.models.course_mentor_history import CourseMentorHistory


class TestCourseMentorHistoryModuleCleanup:
    def test_mapping_and_relationships_are_preserved(self) -> None:
        mapped_column_names: set[str] = {column.name for column in CourseMentorHistory.__table__.columns}
        assert "assigned_to" in mapped_column_names
        assert {"course", "mentor"} <= set(CourseMentorHistory.__mapper__.relationships.keys())
