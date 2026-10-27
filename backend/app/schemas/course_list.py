from enum import Enum


class CourseSortOrder(str, Enum):
    CREATED_AT_DESC = "created_at_desc"
    CREATED_AT_ASC = "created_at_asc"
    TITLE_ASC = "title_asc"
    TITLE_DESC = "title_desc"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    START_DATE_ASC = "start_date_asc"
    START_DATE_DESC = "start_date_desc"
