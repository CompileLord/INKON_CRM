## API-01 — Critical: Private documents are served without authentication
### backend/app/main.py:67–70,97–101
66: 
67: import os
68: from fastapi.staticfiles import StaticFiles
69: os.makedirs(settings.STORAGE_PATH, exist_ok=True)
70: app.mount("/storage", StaticFiles(directory=settings.STORAGE_PATH), name="storage")
71: 
96:     path = request.url.path
97:     if path.startswith("/storage"):
98:         response.headers["Cache-Control"] = "public, max-age=86400"
99:         response.headers["Access-Control-Allow-Origin"] = "*"
100:         response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
101:         return response
102: 

## API-02 — Critical: Restricted onboarding tokens receive ordinary account privileges
### backend/app/core/deps.py:33–52,55–77
32:     )
33:     try:
34:         token = token_auth.credentials
35:         payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
36:         user_id_str: str = payload.get("sub")
37:         if user_id_str is None:
38:             raise credentials_exception
39:         user_id = int(user_id_str)
40:     except (JWTError, ValueError):
41:         raise credentials_exception
42: 
43:     user_repo = SQLAlchemyUserRepository(db)
44:     user = await user_repo.get_by_id(user_id)
45:     if user is None:
46:         raise credentials_exception
47:     if user.is_deleted:
48:         raise HTTPException(
49:             status_code=status.HTTP_401_UNAUTHORIZED,
50:             detail="Account deactivated"
51:         )
52:     return user
53: 
54: 
55: def require_role(roles: List[UserRole]) -> Callable[[User], User]:
56:     def dependency(current_user: User = Depends(get_current_user)) -> User:
57:         if current_user.role not in roles:
58:             raise HTTPException(
59:                 status_code=status.HTTP_403_FORBIDDEN,
60:                 detail="Not enough permissions"
61:             )
62:         return current_user
63:     return dependency
64: 
65: 
66: require_superadmin = require_role([UserRole.SUPERADMIN])
67: require_accountant = require_role([UserRole.SUPERADMIN, UserRole.ACCOUNTANT])
68: require_mentor = require_role([UserRole.SUPERADMIN, UserRole.MENTOR])
69: 
70: 
71: async def check_must_set_password(current_user: User = Depends(get_current_user)) -> User:
72:     if current_user.must_set_password:
73:         raise HTTPException(
74:             status_code=status.HTTP_403_FORBIDDEN,
75:             detail="Must set password first"
76:         )
77:     return current_user
78: 
### backend/app/api/v1/auth.py:75–82
74: 
75: @router.post("/set-password", response_model=TokenPair)
76: async def set_password(
77:     payload: SetPasswordRequest,
78:     current_user: User = Depends(get_current_user),
79:     db: AsyncSession = Depends(get_db_session)
80: ) -> TokenPair:
81:     auth_service = AuthService(db)
82:     return await auth_service.set_password(current_user.id, payload.new_password)
83: 

## API-03 — Critical: Scheduler endpoints disable authentication when configuration is missing
### backend/app/api/v1/cron.py:9–14,17–32
8: 
9: def verify_cron_secret(x_cloud_scheduler_secret: Optional[str] = Header(None)) -> None:
10:     if settings.CRON_SECRET and x_cloud_scheduler_secret != settings.CRON_SECRET:
11:         raise HTTPException(
12:             status_code=status.HTTP_401_UNAUTHORIZED,
13:             detail="Invalid or missing scheduler authorization token"
14:         )
15: 
16: 
17: @router.post("/archive-courses", status_code=status.HTTP_200_OK)
18: async def trigger_archive_courses(
19:     x_cloud_scheduler_secret: Optional[str] = Header(None)
20: ) -> dict:
21:     verify_cron_secret(x_cloud_scheduler_secret)
22:     await archive_expired_courses({})
23:     return {"status": "success", "task": "archive_expired_courses"}
24: 
25: 
26: @router.post("/payment-reminders", status_code=status.HTTP_200_OK)
27: async def trigger_payment_reminders(
28:     x_cloud_scheduler_secret: Optional[str] = Header(None)
29: ) -> dict:
30:     verify_cron_secret(x_cloud_scheduler_secret)
31:     await check_payment_reminders({})
32:     return {"status": "success", "task": "check_payment_reminders"}

## API-04 — Verification-code resend has no throttling
### backend/app/api/v1/auth.py:66–72
65: 
66: @router.post("/resend-code", status_code=status.HTTP_204_NO_CONTENT)
67: async def resend_code(
68:     payload: ResendCodeRequest,
69:     db: AsyncSession = Depends(get_db_session)
70: ) -> None:
71:     auth_service = AuthService(db)
72:     await auth_service.resend_code(payload.email)
73: 

## API-05 — Instance shutdown removes the shared Telegram webhook
### backend/app/main.py:23–41
22: 
23: @asynccontextmanager
24: async def lifespan(app: FastAPI):
25:     from app.telegram_bot.bot import bot
26:     if not settings.TESTING:
27:         try:
28:             await bot.set_webhook(
29:                 url=settings.TELEGRAM_WEBHOOK_URL,
30:                 secret_token=settings.TELEGRAM_BOT_SECRET_TOKEN
31:             )
32:         except Exception:
33:             pass
34:     yield
35:     if not settings.TESTING:
36:         try:
37:             await bot.delete_webhook()
38:         except Exception:
39:             pass
40:     from app.core.redis import close_arq_pool
41:     await close_arq_pool()
42: 

## API-06 — Telegram handler acknowledges failed updates as successful
### backend/app/api/v1/telegram.py:20–26
19:         )
20:     try:
21:         update_dict = await request.json()
22:         update = Update.model_validate(update_dict, context={"bot": bot})
23:         await dp.feed_update(bot, update)
24:     except Exception as e:
25:         logger.error(f"Error handling Telegram webhook: {e}", exc_info=True)
26:     return {"status": "ok"}

## API-07 — Progress chart uses inconsistent populations and average rules
### backend/app/api/v1/courses.py:197–216,225–269,282–298
196: 
197:     enroll_stmt = (
198:         select(Enrollment)
199:         .options(joinedload(Enrollment.student))
200:         .filter(
201:             Enrollment.course_id == id,
202:             Enrollment.status == EnrollmentStatus.ACTIVE,
203:             Enrollment.is_deleted == False
204:         )
205:     )
206:     enroll_res = await db.execute(enroll_stmt)
207:     enrollments = list(enroll_res.scalars().all())
208:     class_size = len(enrollments)
209: 
210:     summaries = []
211:     if journal_ids:
212:         summary_stmt = select(JournalStudentSummary).filter(
213:             JournalStudentSummary.journal_id.in_(journal_ids)
214:         )
215:         summary_res = await db.execute(summary_stmt)
216:         summaries = list(summary_res.scalars().all())
217: 
224: 
225:     if current_user.role == UserRole.STUDENT:
226:         my_percentages = []
227:         my_graded_pcts = []
228:         for j in journals:
229:             sum_score, max_score = summary_map.get((current_user.id, j.id), (0, 0))
230:             pct = score_percentage(sum_score, max_score)
231:             my_percentages.append(pct)
232:             if max_score > 0:
233:                 my_graded_pcts.append(pct)
234:         my_avg = round(sum(my_graded_pcts) / len(my_graded_pcts), 1) if my_graded_pcts else 0.0
235:         my_series = my_percentages + [my_avg]
236: 
237:         class_avg_series = []
238:         graded_class_avgs = []
239:         for j in journals:
240:             j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
241:             if j_summaries:
242:                 j_pcts = [score_percentage(s.sum_score, s.max_period_score) for s in j_summaries]
243:                 period_avg = round(sum(j_pcts) / len(j_pcts), 1)
244:                 class_avg_series.append(period_avg)
245:                 graded_class_avgs.append(period_avg)
246:             else:
247:                 class_avg_series.append(0.0)
248:         overall_class_avg = round(sum(graded_class_avgs) / len(graded_class_avgs), 1) if graded_class_avgs else 0.0
249:         class_avg_series.append(overall_class_avg)
250: 
251:         student_avgs = {}
252:         for enroll in enrollments:
253:             s_id = enroll.student.id
254:             s_pcts = []
255:             for j in journals:
256:                 sum_score, max_score = summary_map.get((s_id, j.id), (0, 0))
257:                 if max_score > 0:
258:                     s_pcts.append(score_percentage(sum_score, max_score))
259:             student_avgs[s_id] = sum(s_pcts) / len(s_pcts) if s_pcts else 0.0
260: 
261:         sorted_student_ids = sorted(student_avgs.keys(), key=lambda sid: student_avgs[sid], reverse=True)
262:         my_rank = (sorted_student_ids.index(current_user.id) + 1) if current_user.id in sorted_student_ids else (len(sorted_student_ids) + 1)
263: 
264:         return {
265:             "periods": periods,
266:             "my_series": my_series,
267:             "class_avg_series": class_avg_series,
268:             "my_rank": my_rank,
269:             "class_size": class_size
270:         }
281: 
282:     for idx, enroll in enumerate(enrollments):
283:         student = enroll.student
284:         scores = []
285:         max_scores = []
286:         percentages = []
287:         for j in journals:
288:             sum_score, max_score = summary_map.get((student.id, j.id), (0, 0))
289:             scores.append(sum_score)
290:             max_scores.append(max_score)
291:             percentages.append(score_percentage(sum_score, max_score))
292: 
293:         avg = round(sum(scores) / len(journals), 2) if journals else 0.0
294:         avg_max = round(sum(max_scores) / len(journals), 2) if journals else 0.0
295:         avg_pct = round(sum(percentages) / len(journals), 2) if journals else 0.0
296:         scores.append(avg)
297:         max_scores.append(avg_max)
298:         percentages.append(avg_pct)
299: 

## API-08 — Monetary inputs exceed the precision and range of persisted amounts
### backend/app/schemas/payment.py:16–21
15: 
16:     model_config = {"extra": "forbid"}
17:     student_id: int
18:     course_id: int
19:     amount: Decimal = Field(gt=0)
20:     paid_at: datetime
21:     method: PaymentMethod
22:     comment: Optional[str] = None
### backend/app/schemas/ledger.py:40–42,49–55,61–66,72–78
39: 
40: class RefundPaymentPayload(BaseModel):
41:     model_config = {"extra": "forbid"}
42:     amount: Decimal = Field(gt=0)
43:     # False -> cash leaves the centre. True -> value is retained as wallet credit.
48: 
49: class DiscountCreatePayload(BaseModel):
50:     """A concession that reduces the receivable. Never attached to a payment."""
51: 
52:     model_config = {"extra": "forbid"}
53:     student_id: int
54:     charge_id: Optional[int] = None
55:     amount: Decimal = Field(gt=0)
56:     occurred_at: Optional[datetime] = None
60: 
61: class AdjustmentCreatePayload(BaseModel):
62:     """Correcting credit posted in the open period (SuperAdmin only)."""
63: 
64:     model_config = {"extra": "forbid"}
65:     student_id: int
66:     amount: Decimal = Field(gt=0)
67:     occurred_at: Optional[datetime] = None
71: 
72: class AllocationCreatePayload(BaseModel):
73:     """Manually apply a student's wallet credit to a specific charge."""
74: 
75:     model_config = {"extra": "forbid"}
76:     student_id: int
77:     charge_id: int
78:     amount: Optional[Decimal] = Field(None, gt=0)
79: 
### backend/app/schemas/course.py:32–42
31: class CourseCreate(BaseModel):
32:     model_config = {"extra": "forbid"}
33:     title: str = Field(min_length=1, max_length=255)
34:     description: str
35:     start_date: date
36:     end_date: date
37:     exam_type: CourseExamType
38:     price: Decimal = Field(gt=0)
39:     mentor_id: int
40:     schedules: List[CourseScheduleCreate] = Field(min_length=1)
41: 
42:     @field_validator("end_date")
43:     @classmethod

## API-09 — Several regression tests do not exercise the invariant they claim
### backend/app/tests/integration/test_student_cabinet_backend.py:119–156,159–206
118: @pytest.mark.asyncio
119: async def test_student_course_bucket_rule_and_rank_computation(
120:     client: AsyncClient,
121:     test_admin: User,
122:     test_mentor: User,
123:     test_student: User,
124:     db_session: AsyncSession,
125: ):
126:     """Test active vs archive bucket logic (§1.1) and rank calculation with ungraded period exclusion."""
127:     admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
128: 
129:     # Active course
130:     active_resp = await client.post(
131:         "/api/v1/courses/",
132:         json={
133:             "title": "Active Course",
134:             "description": "Active course test",
135:             "start_date": "2026-01-01",
136:             "end_date": "2026-06-01",
137:             "exam_type": "weekly",
138:             "price": "150.00",
139:             "mentor_id": test_mentor.id,
140:             "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "11:30:00"}],
141:         },
142:         headers=admin_headers,
143:     )
144:     active_course_id = active_resp.json()["id"]
145:     await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": active_course_id}, headers=admin_headers)
146: 
147:     # Student requests profile
148:     student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
149:     profile_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
150:     assert profile_resp.status_code == 200
151:     pdata = profile_resp.json()
152: 
153:     # Find the course entry
154:     course_entry = next((c for c in pdata["courses"] if c["course"]["id"] == active_course_id), None)
155:     assert course_entry is not None
156:     assert course_entry["bucket"] == "active"
157: 
158: 
159: @pytest.mark.asyncio
160: async def test_journal_detail_student_roster_narrowing_and_rank(
161:     client: AsyncClient,
162:     test_admin: User,
163:     test_mentor: User,
164:     test_student: User,
165:     db_session: AsyncSession,
166: ):
167:     """Test GET /journals/{id} roster narrowing to 1 student for student role and presence of rank fields."""
168:     admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
169: 
170:     course_resp = await client.post(
171:         "/api/v1/courses/",
172:         json={
173:             "title": "Journal Detail Course",
174:             "description": "Testing journal detail narrowing",
175:             "start_date": "2026-01-01",
176:             "end_date": "2026-06-01",
177:             "exam_type": "weekly",
178:             "price": "200.00",
179:             "mentor_id": test_mentor.id,
180:             "schedules": [{"day_of_week": 2, "time_start": "14:00:00", "time_end": "15:30:00"}],
181:         },
182:         headers=admin_headers,
183:     )
184:     course_id = course_resp.json()["id"]
185:     await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)
186: 
187:     # Find journal ID
188:     journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
189:     journal = journals_res.scalars().first()
190: 
191:     student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
192:     jresp = await client.get(f"/api/v1/journals/{journal.id}", headers=student_headers)
193:     assert jresp.status_code == 200
194:     jdata = jresp.json()
195: 
196:     # Assert student roster is narrowed to 1 student
197:     assert "students" in jdata
198:     assert len(jdata["students"]) == 1
199:     assert jdata["students"][0]["student_id"] == test_student.id
200: 
201:     # Assert rank fields are present
202:     assert "my_rank" in jdata
203:     assert "class_size" in jdata
204:     assert "class_avg_percentage" in jdata
205:     assert jdata["class_size"] == 1
206:     assert jdata["my_rank"] == 1
### backend/app/tests/integration/test_coverage_gaps.py:30–37,41–52
29: 
30:     # Test refresh
31:     res_ref = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
32:     assert res_ref.status_code == 200
33:     assert "access_token" in res_ref.json()
34: 
35:     # Test logout
36:     res_out = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
37:     assert res_out.status_code in [200, 204]
38: 
40: @pytest.mark.asyncio
41: async def test_password_reset_flow(client: AsyncClient, test_student: User):
42:     # Request password reset
43:     res = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email})
44:     assert res.status_code == 200
45: 
46:     # Verify code with invalid code
47:     res_v = await client.post("/api/v1/auth/password-reset/verify", json={"email": test_student.email, "code": "000000"})
48:     assert res_v.status_code in [400, 422]
49: 
50:     # Confirm with invalid payload
51:     res_c = await client.post("/api/v1/auth/password-reset/confirm", json={"token": "invalid", "new_password": "NewPassword123!"})
52:     assert res_c.status_code in [400, 401, 422]
53: 
### backend/app/tests/integration/test_documents.py:56–70
55:     assert response_spoofed.status_code == 400
56: 
57:     # 4. Access Matrix: Student GET should only see own
58:     student_token = create_access_token(test_student.id, test_student.role)
59:     student_headers = {"Authorization": f"Bearer {student_token}"}
60: 
61:     list_resp = await client.get("/api/v1/documents/", headers=student_headers)
62:     assert list_resp.status_code == 200
63:     assert len(list_resp.json()["items"]) == 1
64: 
65:     # Mentor GET should be able to see student's document
66:     mentor_token = create_access_token(test_mentor.id, test_mentor.role)
67:     mentor_headers = {"Authorization": f"Bearer {mentor_token}"}
68: 
69:     list_resp_m = await client.get("/api/v1/documents/", headers=mentor_headers)
70:     assert list_resp_m.status_code == 200
71:     assert len(list_resp_m.json()["items"]) == 1

## API-10 — Optional: Move domain calculation and queries out of routers and complete typed response boundaries
### backend/app/api/v1/courses.py:186–315
185: 
186: @router.get("/{id}/progress-chart")
187: async def get_progress_chart(
188:     id: int,
189:     current_user: User = Depends(get_current_user),
190:     db: AsyncSession = Depends(get_db_session)
191: ) -> dict:
192:     await check_course_access(id, current_user, db)
193: 
194:     journals = await get_course_journals(id, db)
195:     journal_ids = [j.id for j in journals]
196: 
197:     enroll_stmt = (
198:         select(Enrollment)
199:         .options(joinedload(Enrollment.student))
200:         .filter(
201:             Enrollment.course_id == id,
202:             Enrollment.status == EnrollmentStatus.ACTIVE,
203:             Enrollment.is_deleted == False
204:         )
205:     )
206:     enroll_res = await db.execute(enroll_stmt)
207:     enrollments = list(enroll_res.scalars().all())
208:     class_size = len(enrollments)
209: 
210:     summaries = []
211:     if journal_ids:
212:         summary_stmt = select(JournalStudentSummary).filter(
213:             JournalStudentSummary.journal_id.in_(journal_ids)
214:         )
215:         summary_res = await db.execute(summary_stmt)
216:         summaries = list(summary_res.scalars().all())
217: 
218:     summary_map = {(s.student_id, s.journal_id): (s.sum_score, s.max_period_score) for s in summaries}
219: 
220:     periods = [
221:         {"id": j.id, "period_label": j.period_label}
222:         for j in journals
223:     ]
224: 
225:     if current_user.role == UserRole.STUDENT:
226:         my_percentages = []
227:         my_graded_pcts = []
228:         for j in journals:
229:             sum_score, max_score = summary_map.get((current_user.id, j.id), (0, 0))
230:             pct = score_percentage(sum_score, max_score)
231:             my_percentages.append(pct)
232:             if max_score > 0:
233:                 my_graded_pcts.append(pct)
234:         my_avg = round(sum(my_graded_pcts) / len(my_graded_pcts), 1) if my_graded_pcts else 0.0
235:         my_series = my_percentages + [my_avg]
236: 
237:         class_avg_series = []
238:         graded_class_avgs = []
239:         for j in journals:
240:             j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
241:             if j_summaries:
242:                 j_pcts = [score_percentage(s.sum_score, s.max_period_score) for s in j_summaries]
243:                 period_avg = round(sum(j_pcts) / len(j_pcts), 1)
244:                 class_avg_series.append(period_avg)
245:                 graded_class_avgs.append(period_avg)
246:             else:
247:                 class_avg_series.append(0.0)
248:         overall_class_avg = round(sum(graded_class_avgs) / len(graded_class_avgs), 1) if graded_class_avgs else 0.0
249:         class_avg_series.append(overall_class_avg)
250: 
251:         student_avgs = {}
252:         for enroll in enrollments:
253:             s_id = enroll.student.id
254:             s_pcts = []
255:             for j in journals:
256:                 sum_score, max_score = summary_map.get((s_id, j.id), (0, 0))
257:                 if max_score > 0:
258:                     s_pcts.append(score_percentage(sum_score, max_score))
259:             student_avgs[s_id] = sum(s_pcts) / len(s_pcts) if s_pcts else 0.0
260: 
261:         sorted_student_ids = sorted(student_avgs.keys(), key=lambda sid: student_avgs[sid], reverse=True)
262:         my_rank = (sorted_student_ids.index(current_user.id) + 1) if current_user.id in sorted_student_ids else (len(sorted_student_ids) + 1)
263: 
264:         return {
265:             "periods": periods,
266:             "my_series": my_series,
267:             "class_avg_series": class_avg_series,
268:             "my_rank": my_rank,
269:             "class_size": class_size
270:         }
271: 
272:     labels = [j.period_label for j in journals] + ["Average"]
273:     datasets = []
274: 
275:     COLOR_PALETTE = [
276:         "#E53E3E", "#319795", "#3182CE", "#D69E2E", "#D53F8C",
277:         "#805AD5", "#DD6B20", "#38A169", "#00B5D8", "#B83280",
278:         "#4C51BF", "#C05621", "#2B6CB0", "#2F855A", "#9B2C2C",
279:         "#2C7A7B", "#6B46C1", "#975A16", "#702459", "#1A365D"
280:     ]
281: 
282:     for idx, enroll in enumerate(enrollments):
283:         student = enroll.student
284:         scores = []
285:         max_scores = []
286:         percentages = []
287:         for j in journals:
288:             sum_score, max_score = summary_map.get((student.id, j.id), (0, 0))
289:             scores.append(sum_score)
290:             max_scores.append(max_score)
291:             percentages.append(score_percentage(sum_score, max_score))
292: 
293:         avg = round(sum(scores) / len(journals), 2) if journals else 0.0
294:         avg_max = round(sum(max_scores) / len(journals), 2) if journals else 0.0
295:         avg_pct = round(sum(percentages) / len(journals), 2) if journals else 0.0
296:         scores.append(avg)
297:         max_scores.append(avg_max)
298:         percentages.append(avg_pct)
299: 
300:         color_hex = enroll.color_hex if enroll.color_hex and enroll.color_hex != "#FF5733" else COLOR_PALETTE[idx % len(COLOR_PALETTE)]
301: 
302:         datasets.append({
303:             "student_id": student.id,
304:             "name": f"{student.first_name} {student.last_name}",
305:             "color_hex": color_hex,
306:             "scores": scores,
307:             "max_scores": max_scores,
308:             "percentages": percentages
309:         })
310: 
311:     return {
312:         "labels": labels,
313:         "periods": periods,
314:         "datasets": datasets
315:     }
316: 
### backend/app/api/v1/mentors.py:137–172
136: 
137:     from app.models.course import Course, CourseStatus
138:     from app.models.enrollment import Enrollment
139:     from app.models.journal import Journal
140:     from app.models.journal_student_summary import JournalStudentSummary
141:     from sqlalchemy import select, func
142: 
143:     active_courses_stmt = select(func.count(Course.id)).filter(
144:         Course.mentor_id == id,
145:         Course.status == CourseStatus.ACTIVE,
146:         Course.is_deleted == False
147:     )
148:     active_courses_res = await db.execute(active_courses_stmt)
149:     active_courses_count = active_courses_res.scalar() or 0
150: 
151:     students_stmt = select(func.count(func.distinct(Enrollment.student_id))).join(Course).filter(
152:         Course.mentor_id == id,
153:         Enrollment.is_deleted == False
154:     )
155:     students_res = await db.execute(students_stmt)
156:     total_students_count = students_res.scalar() or 0
157: 
158:     score_stmt = select(func.avg(JournalStudentSummary.sum_score)).join(
159:         Journal, JournalStudentSummary.journal_id == Journal.id
160:     ).join(Course, Journal.course_id == Course.id).filter(
161:         Course.mentor_id == id,
162:         Course.is_deleted == False
163:     )
164:     score_res = await db.execute(score_stmt)
165:     avg_score = score_res.scalar()
166:     average_student_score = float(avg_score) if avg_score is not None else 0.0
167: 
168:     return {
169:         "active_courses_count": active_courses_count,
170:         "total_students_count": total_students_count,
171:         "average_student_score": average_student_score
172:     }
173: 
### backend/app/api/v1/students.py:75–113
74:     current_user: User = Depends(get_current_user),
75:     db: AsyncSession = Depends(get_db_session)
76: ) -> dict:
77:     if current_user.role == UserRole.STUDENT and current_user.id != id:
78:         raise HTTPException(
79:             status_code=status.HTTP_403_FORBIDDEN,
80:             detail="Access denied to other student profiles"
81:         )
82: 
83:     if current_user.role == UserRole.MENTOR:
84:         query = select(Enrollment).join(Course).filter(
85:             Enrollment.student_id == id,
86:             Course.mentor_id == current_user.id,
87:             Enrollment.is_deleted == False
88:         )
89:         result = await db.execute(query)
90:         enrollment = result.scalars().first()
91:         if not enrollment:
92:             raise HTTPException(
93:                 status_code=status.HTTP_403_FORBIDDEN,
94:                 detail="Not authorized to view this student's profile"
95:             )
96: 
97:     user_repo = SQLAlchemyUserRepository(db)
98:     target_user = await user_repo.get_by_id(id)
99:     if not target_user or target_user.role != UserRole.STUDENT:
100:         raise HTTPException(
101:             status_code=status.HTTP_404_NOT_FOUND,
102:             detail="Student not found"
103:         )
104: 
105:     stats = await user_repo.get_student_profile_stats(id)
106:     return {
107:         "user": target_user,
108:         "totals": stats["totals"],
109:         "courses": stats["courses"],
110:         "avg_score": stats["avg_score"],
111:         "absences": stats["absences"],
112:         "total_lessons": stats["total_lessons"]
113:     }
### backend/app/api/v1/journals.py:22–29
21: 
22: @router.get("/{id}", response_model=dict)
23: async def get_journal(
24:     id: int,
25:     current_user: User = Depends(get_current_user),
26:     db: AsyncSession = Depends(get_db_session)
27: ) -> dict:
28:     journal_service = JournalService(db)
29:     return await journal_service.get_journal(id, current_user)
30: 
### backend/app/api/v1/finance.py:51,140–148
50:         paid_at=payload.paid_at,
51:         method=payload.method,
52:         comment=payload.comment,
139:     finance_service = FinanceService(db)
140:     return await finance_service.allocate_credit(payload=payload, current_user=current_user)
141: 
142: 
143: @router.get("/students/{id}/ledger", response_model=List[dict])
144: async def get_student_ledger(
145:     id: int = Path(..., ge=1),
146:     current_user: User = Depends(require_accountant),
147:     db: AsyncSession = Depends(get_db_session),
148: ) -> List[dict]:
149:     finance_service = FinanceService(db)
### backend/app/core/deps.py:80–126
79: 
80: async def require_course_owner(
81:     course_id: int,
82:     current_user: User = Depends(get_current_user),
83:     db: AsyncSession = Depends(get_db_session)
84: ) -> User:
85:     if current_user.role == UserRole.SUPERADMIN:
86:         return current_user
87:     if current_user.role != UserRole.MENTOR:
88:         raise HTTPException(
89:             status_code=status.HTTP_403_FORBIDDEN,
90:             detail="Not enough permissions"
91:         )
92:     from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
93:     course_repo = SQLAlchemyCourseRepository(db)
94:     course = await course_repo.get_by_id(course_id)
95:     if not course:
96:         raise HTTPException(
97:             status_code=status.HTTP_404_NOT_FOUND,
98:             detail="Course not found"
99:         )
100:     if course.mentor_id != current_user.id:
101:         raise HTTPException(
102:             status_code=status.HTTP_403_FORBIDDEN,
103:             detail="Not the owner of this course"
104:         )
105:     return current_user
106: 
107: 
108: async def require_student_self(
109:     student_id: int,
110:     current_user: User = Depends(get_current_user)
111: ) -> User:
112:     if current_user.role == UserRole.SUPERADMIN:
113:         return current_user
114:     if current_user.role != UserRole.STUDENT or current_user.id != student_id:
115:         raise HTTPException(
116:             status_code=status.HTTP_403_FORBIDDEN,
117:             detail="Access denied to other student profiles"
118:         )
119:     return current_user
120: 
121: 
122: def get_storage_service() -> "StorageService":
123:     from app.services.storage_service import StorageService, LocalStorageService
124:     return LocalStorageService()
125: 
126: 

## API-11 — Optional: Bound aggregate responses and make chart work proportional to the data returned
### backend/app/api/v1/courses.py:194–216,239–259,282–308
193: 
194:     journals = await get_course_journals(id, db)
195:     journal_ids = [j.id for j in journals]
196: 
197:     enroll_stmt = (
198:         select(Enrollment)
199:         .options(joinedload(Enrollment.student))
200:         .filter(
201:             Enrollment.course_id == id,
202:             Enrollment.status == EnrollmentStatus.ACTIVE,
203:             Enrollment.is_deleted == False
204:         )
205:     )
206:     enroll_res = await db.execute(enroll_stmt)
207:     enrollments = list(enroll_res.scalars().all())
208:     class_size = len(enrollments)
209: 
210:     summaries = []
211:     if journal_ids:
212:         summary_stmt = select(JournalStudentSummary).filter(
213:             JournalStudentSummary.journal_id.in_(journal_ids)
214:         )
215:         summary_res = await db.execute(summary_stmt)
216:         summaries = list(summary_res.scalars().all())
217: 
238:         graded_class_avgs = []
239:         for j in journals:
240:             j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
241:             if j_summaries:
242:                 j_pcts = [score_percentage(s.sum_score, s.max_period_score) for s in j_summaries]
243:                 period_avg = round(sum(j_pcts) / len(j_pcts), 1)
244:                 class_avg_series.append(period_avg)
245:                 graded_class_avgs.append(period_avg)
246:             else:
247:                 class_avg_series.append(0.0)
248:         overall_class_avg = round(sum(graded_class_avgs) / len(graded_class_avgs), 1) if graded_class_avgs else 0.0
249:         class_avg_series.append(overall_class_avg)
250: 
251:         student_avgs = {}
252:         for enroll in enrollments:
253:             s_id = enroll.student.id
254:             s_pcts = []
255:             for j in journals:
256:                 sum_score, max_score = summary_map.get((s_id, j.id), (0, 0))
257:                 if max_score > 0:
258:                     s_pcts.append(score_percentage(sum_score, max_score))
259:             student_avgs[s_id] = sum(s_pcts) / len(s_pcts) if s_pcts else 0.0
260: 
281: 
282:     for idx, enroll in enumerate(enrollments):
283:         student = enroll.student
284:         scores = []
285:         max_scores = []
286:         percentages = []
287:         for j in journals:
288:             sum_score, max_score = summary_map.get((student.id, j.id), (0, 0))
289:             scores.append(sum_score)
290:             max_scores.append(max_score)
291:             percentages.append(score_percentage(sum_score, max_score))
292: 
293:         avg = round(sum(scores) / len(journals), 2) if journals else 0.0
294:         avg_max = round(sum(max_scores) / len(journals), 2) if journals else 0.0
295:         avg_pct = round(sum(percentages) / len(journals), 2) if journals else 0.0
296:         scores.append(avg)
297:         max_scores.append(avg_max)
298:         percentages.append(avg_pct)
299: 
300:         color_hex = enroll.color_hex if enroll.color_hex and enroll.color_hex != "#FF5733" else COLOR_PALETTE[idx % len(COLOR_PALETTE)]
301: 
302:         datasets.append({
303:             "student_id": student.id,
304:             "name": f"{student.first_name} {student.last_name}",
305:             "color_hex": color_hex,
306:             "scores": scores,
307:             "max_scores": max_scores,
308:             "percentages": percentages
309:         })
### backend/app/api/v1/finance.py:140–148,187–194
139:     finance_service = FinanceService(db)
140:     return await finance_service.allocate_credit(payload=payload, current_user=current_user)
141: 
142: 
143: @router.get("/students/{id}/ledger", response_model=List[dict])
144: async def get_student_ledger(
145:     id: int = Path(..., ge=1),
146:     current_user: User = Depends(require_accountant),
147:     db: AsyncSession = Depends(get_db_session),
148: ) -> List[dict]:
149:     finance_service = FinanceService(db)
186:     current_user: User = Depends(require_accountant),
187:     db: AsyncSession = Depends(get_db_session),
188: ) -> List[dict]:
189:     finance_service = FinanceService(db)
190:     return await finance_service.list_student_credits()
191: 
192: 
193: @router.get("/payments/{id}/receipt", response_model=PaymentReceiptResponse)
194: async def get_payment_receipt(
195:     id: int = Path(..., ge=1),
### backend/app/api/v1/students.py:56–70
55: 
56: @router.get("/me/journals", response_model=List[StudentJournalPeriodResponse])
57: async def get_my_journals(
58:     course_id: Optional[int] = None,
59:     current_user: User = Depends(get_current_user),
60:     db: AsyncSession = Depends(get_db_session)
61: ) -> List[dict]:
62:     if current_user.role != UserRole.STUDENT:
63:         raise HTTPException(
64:             status_code=status.HTTP_403_FORBIDDEN,
65:             detail="Current user is not a student"
66:         )
67:     user_repo = SQLAlchemyUserRepository(db)
68:     return await user_repo.get_student_journals(student_id=current_user.id, course_id=course_id)
69: 
70: 
71: @router.get("/{id}/profile", response_model=StudentProfileResponse)
### backend/app/api/v1/cron.py:17–32
16: 
17: @router.post("/archive-courses", status_code=status.HTTP_200_OK)
18: async def trigger_archive_courses(
19:     x_cloud_scheduler_secret: Optional[str] = Header(None)
20: ) -> dict:
21:     verify_cron_secret(x_cloud_scheduler_secret)
22:     await archive_expired_courses({})
23:     return {"status": "success", "task": "archive_expired_courses"}
24: 
25: 
26: @router.post("/payment-reminders", status_code=status.HTTP_200_OK)
27: async def trigger_payment_reminders(
28:     x_cloud_scheduler_secret: Optional[str] = Header(None)
29: ) -> dict:
30:     verify_cron_secret(x_cloud_scheduler_secret)
31:     await check_payment_reminders({})
32:     return {"status": "success", "task": "check_payment_reminders"}

## API-12 — Optional: Align settings and phone validation with the project's declared input rules
### backend/app/schemas/org_settings.py:15–18
14: 
15: class OrgSettingsUpdate(BaseModel):
16:     org_name: Optional[str] = Field(None, min_length=1, max_length=255)
17:     notify_payments: Optional[bool] = None
18:     notify_debts: Optional[bool] = None
### backend/app/schemas/user.py:14–16,26–28,37–39
13:     date_of_birth: Optional[date] = None
14:     phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
15:     parent_telegram_chat_id: Optional[int] = None
16:     parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
17:     payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)
25:     date_of_birth: Optional[date] = None
26:     phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
27:     parent_telegram_chat_id: Optional[int] = None
28:     parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
29:     payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)
36:     date_of_birth: Optional[date] = None
37:     phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
38:     parent_telegram_chat_id: Optional[int] = None
39:     parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
40: 

## BUS-01 — Critical: Refresh tokens are identical across users minted in the same second
### backend/app/core/security.py:60-72
59: 
60: def create_refresh_token(expires_delta: Optional[timedelta] = None) -> str:
61:     now = datetime.now(timezone.utc)
62:     if expires_delta:
63:         expire = now + expires_delta
64:     else:
65:         expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
66: 
67:     to_encode: Dict[str, Any] = {
68:         "exp": int(expire.timestamp()),
69:         "iat": int(now.timestamp())
70:     }
71: 
72:     return jwt.encode(to_encode, settings.JWT_REFRESH_SECRET_KEY, algorithm="HS256")
### backend/app/services/auth_service.py:41-51,69-83
40:         access_token = create_access_token(user.id, user.role, scope=scope)
41:         refresh_token = create_refresh_token()
42: 
43:         token_hash = hash_token(refresh_token)
44:         expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
45: 
46:         db_token = RefreshToken(
47:             user_id=user.id,
48:             token_hash=token_hash,
49:             expires_at=expires_at
50:         )
51:         await self.token_repo.create(db_token)
52: 
68: 
69:         token_hash = hash_token(refresh_token)
70:         db_token = await self.token_repo.get_valid_token(token_hash)
71:         if not db_token:
72:             raise credentials_exception
73: 
74:         db_token.revoked_at = datetime.now(timezone.utc)
75:         await self.token_repo.update(db_token)
76: 
77:         user = await self.user_repo.get_by_id(db_token.user_id)
78:         if not user or user.is_deleted:
79:             raise credentials_exception
80: 
81:         scope = "must_set_password" if user.must_set_password else None
82:         new_access_token = create_access_token(user.id, user.role, scope=scope)
83:         new_refresh_token = create_refresh_token()
84: 

## BUS-02 — Critical: Concurrent ledger writers can spend the same credit and refund beyond the payment
### backend/app/services/finance_service.py:165-177,271-324,736-770,785-857
164: 
165:     async def _entry_available(self, entry: LedgerEntry) -> Decimal:
166:         """Credit on this entry not yet applied and not cashed out."""
167:         allocated = await self._active_allocated([entry.id])
168:         cashed_out = await self._cash_out_refunded(entry.id)
169:         return entry.amount - allocated - cashed_out
170: 
171:     async def _charge_remaining(self, charge: Charge) -> Decimal:
172:         q = select(func.coalesce(func.sum(Allocation.amount), ZERO)).filter(
173:             Allocation.charge_id == charge.id,
174:             Allocation.reversed_by_entry_id.is_(None),
175:         )
176:         res = await self.db.execute(q)
177:         return charge.amount - Decimal(res.scalar() or 0)
178: 
270:         return list(res.scalars().all())
271: 
272:     async def _apply_credit(
273:         self,
274:         entries: List[LedgerEntry],
275:         charges: List[Charge],
276:     ) -> List[int]:
277:         """Apply available credit from ``entries`` to ``charges``, oldest first."""
278:         if not entries or not charges:
279:             return []
280: 
281:         charge_ids = [c.id for c in charges]
282:         alloc_q = (
283:             select(Allocation.charge_id, func.coalesce(func.sum(Allocation.amount), ZERO))
284:             .filter(
285:                 Allocation.charge_id.in_(charge_ids),
286:                 Allocation.reversed_by_entry_id.is_(None),
287:             )
288:             .group_by(Allocation.charge_id)
289:         )
290:         alloc_res = await self.db.execute(alloc_q)
291:         settled_by_charge: Dict[int, Decimal] = {row[0]: Decimal(row[1] or 0) for row in alloc_res.all()}
292: 
293:         touched: List[int] = []
294:         for entry in entries:
295:             available = await self._entry_available(entry)
296:             if available <= ZERO:
297:                 continue
298: 
299:             for charge in charges:
300:                 if available <= ZERO:
301:                     break
302:                 needed = charge.amount - settled_by_charge.get(charge.id, ZERO)
303:                 if needed <= ZERO:
304:                     continue
305: 
306:                 amount = min(available, needed)
307:                 self.db.add(
308:                     Allocation(
309:                         ledger_entry_id=entry.id,
310:                         charge_id=charge.id,
311:                         amount=amount,
312:                     )
313:                 )
314:                 settled_by_charge[charge.id] = settled_by_charge.get(charge.id, ZERO) + amount
315:                 available -= amount
316:                 touched.append(charge.id)
317: 
318:         await self.db.flush()
319:         await self._recompute_charge_status(touched)
320:         return touched
321: 
322:     async def auto_allocate_student_credit(
323:         self,
324:         student_id: int,
325:         prefer_enrollment_id: Optional[int] = None,
735: 
736:         refunded_res = await self.db.execute(
737:             select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
738:                 LedgerEntry.reverses_entry_id == target.id,
739:                 LedgerEntry.type == LedgerEntryType.REFUND,
740:             )
741:         )
742:         already_refunded = Decimal(refunded_res.scalar() or 0)
743:         max_refundable = target.amount - already_refunded
744:         if payload.amount > max_refundable:
745:             raise HTTPException(
746:                 status_code=status.HTTP_400_BAD_REQUEST,
747:                 detail=f"Refund amount {payload.amount} exceeds max refundable {max_refundable}",
748:             )
749: 
750:         cash_out = not payload.to_wallet
751:         refund_entry = LedgerEntry(
752:             student_id=target.student_id,
753:             type=LedgerEntryType.REFUND,
754:             amount=payload.amount,
755:             method=target.method if cash_out else None,
756:             is_cash_out=cash_out,
757:             occurred_at=now,
758:             recorded_by_id=current_user.id,
759:             reverses_entry_id=target.id,
760:             reason_code=payload.reason_code,
761:             comment=payload.comment,
762:         )
763:         self.db.add(refund_entry)
764:         await self.db.flush()
765: 
766:         # Free up the refunded value: for a cash-out the money is gone, for a
767:         # wallet refund it returns to the student's unapplied credit.
768:         affected = await self._reverse_allocations(target.id, payload.amount, refund_entry)
769:         await self._recompute_charge_status(affected)
770:         # As with a void, no automatic re-allocation — see void_payment.
771: 
784:         return await self._load_entry(refund_entry.id)
785: 
786:     async def allocate_credit(self, payload: AllocationCreatePayload, current_user: User) -> LedgerEntry:
787:         """Manually apply wallet credit to a specific charge."""
788:         charge_res = await self.db.execute(
789:             select(Charge).filter(
790:                 Charge.id == payload.charge_id,
791:                 Charge.student_id == payload.student_id,
792:                 Charge.is_deleted == False,  # noqa: E712
793:             )
794:         )
795:         charge = charge_res.scalars().first()
796:         if not charge:
797:             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charge not found for student")
798:         if charge.status == ChargeStatus.CANCELLED:
799:             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Charge is cancelled")
800: 
801:         remaining = await self._charge_remaining(charge)
802:         if remaining <= ZERO:
803:             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Charge is already settled")
804: 
805:         wallet = await self.get_unallocated_credit(payload.student_id)
806:         amount = payload.amount or min(wallet, remaining)
807:         if amount <= ZERO:
808:             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No credit available to allocate")
809:         if amount > wallet:
810:             raise HTTPException(
811:                 status_code=status.HTTP_400_BAD_REQUEST,
812:                 detail=f"Amount {amount} exceeds available credit {wallet}",
813:             )
814:         if amount > remaining:
815:             raise HTTPException(
816:                 status_code=status.HTTP_400_BAD_REQUEST,
817:                 detail=f"Amount {amount} exceeds the charge's remaining balance {remaining}",
818:             )
819: 
820:         voided = self._voided_ids_subquery()
821:         entries_res = await self.db.execute(
822:             select(LedgerEntry)
823:             .filter(
824:                 LedgerEntry.student_id == payload.student_id,
825:                 LedgerEntry.type.in_(CREDIT_TYPES),
826:                 LedgerEntry.id.notin_(voided),
827:             )
828:             .order_by(LedgerEntry.occurred_at.asc(), LedgerEntry.id.asc())
829:         )
830:         entries = list(entries_res.scalars().all())
831: 
832:         outstanding = amount
833:         last_entry_id = None
834:         for entry in entries:
835:             if outstanding <= ZERO:
836:                 break
837:             available = await self._entry_available(entry)
838:             if available <= ZERO:
839:                 continue
840:             portion = min(available, outstanding)
841:             self.db.add(
842:                 Allocation(ledger_entry_id=entry.id, charge_id=charge.id, amount=portion)
843:             )
844:             outstanding -= portion
845:             last_entry_id = entry.id
846: 
847:         await self.db.flush()
848:         await self._recompute_charge_status([charge.id])
849: 
850:         await self._log_audit(
851:             user_id=current_user.id,
852:             action="update",
853:             entity_type="allocation",
854:             entity_id=charge.id,
855:             changes={"allocated": str(amount), "student_id": payload.student_id},
856:         )
857:         await self._invalidate_cache()
858:         return await self._load_entry(last_entry_id) if last_entry_id else None

## BUS-03 — Critical: A voided payment can still be refunded
### backend/app/services/finance_service.py:717-770,866-878
716: 
717:     async def refund_payment(
718:         self,
719:         payment_id: int,
720:         payload: RefundPaymentPayload,
721:         current_user: User,
722:     ) -> LedgerEntry:
723:         """Refund part or all of a payment (SuperAdmin only)."""
724:         if current_user.role != UserRole.SUPERADMIN:
725:             raise HTTPException(
726:                 status_code=status.HTTP_403_FORBIDDEN,
727:                 detail="Only SuperAdmin can issue refunds",
728:             )
729: 
730:         target = await self._get_payment_entry(payment_id)
731: 
732:         await self._check_period_open(target.occurred_at, "a refund of an entry in that period")
733:         now = datetime.now(timezone.utc)
734:         await self._check_period_open(now, "refund")
735: 
736:         refunded_res = await self.db.execute(
737:             select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
738:                 LedgerEntry.reverses_entry_id == target.id,
739:                 LedgerEntry.type == LedgerEntryType.REFUND,
740:             )
741:         )
742:         already_refunded = Decimal(refunded_res.scalar() or 0)
743:         max_refundable = target.amount - already_refunded
744:         if payload.amount > max_refundable:
745:             raise HTTPException(
746:                 status_code=status.HTTP_400_BAD_REQUEST,
747:                 detail=f"Refund amount {payload.amount} exceeds max refundable {max_refundable}",
748:             )
749: 
750:         cash_out = not payload.to_wallet
751:         refund_entry = LedgerEntry(
752:             student_id=target.student_id,
753:             type=LedgerEntryType.REFUND,
754:             amount=payload.amount,
755:             method=target.method if cash_out else None,
756:             is_cash_out=cash_out,
757:             occurred_at=now,
758:             recorded_by_id=current_user.id,
759:             reverses_entry_id=target.id,
760:             reason_code=payload.reason_code,
761:             comment=payload.comment,
762:         )
763:         self.db.add(refund_entry)
764:         await self.db.flush()
765: 
766:         # Free up the refunded value: for a cash-out the money is gone, for a
767:         # wallet refund it returns to the student's unapplied credit.
768:         affected = await self._reverse_allocations(target.id, payload.amount, refund_entry)
769:         await self._recompute_charge_status(affected)
770:         # As with a void, no automatic re-allocation — see void_payment.
771: 
865:         res = await self.db.execute(
866:             select(LedgerEntry).filter(
867:                 LedgerEntry.id == payment_id,
868:                 LedgerEntry.type == LedgerEntryType.PAYMENT,
869:             )
870:         )
871:         entry = res.scalars().first()
872:         if not entry:
873:             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment entry not found")
874:         return entry
875: 
876:     async def _load_entry(self, entry_id: int) -> LedgerEntry:
877:         res = await self.db.execute(
878:             select(LedgerEntry)
879:             .options(selectinload(LedgerEntry.allocations))

## BUS-04 — Uploaded documents with the same filename overwrite previous documents
### backend/app/services/storage_service.py:40-62,112-120
39:         entity_type = re.sub(r'[^a-zA-Z0-9_-]', '', entity_type)
40:         
41:         # Get only the basename to strip any path components
42:         filename = os.path.basename(filename)
43:         filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
44:         if not filename or filename in ('.', '..'):
45:             filename = f"file_{uuid.uuid4().hex}"
46: 
47:         target_dir = os.path.abspath(os.path.join(self.storage_path, entity_type, str(entity_id)))
48:         os.makedirs(target_dir, exist_ok=True)
49:         
50:         filepath = os.path.abspath(os.path.join(target_dir, filename))
51:         
52:         # Verify resolved path is strictly within the target directory
53:         if not filepath.startswith(target_dir + os.sep) and filepath != target_dir:
54:             raise HTTPException(
55:                 status_code=status.HTTP_400_BAD_REQUEST,
56:                 detail="Invalid file path structure"
57:             )
58: 
59:         path = anyio.Path(filepath)
60:         await path.write_bytes(file_content)
61: 
62:         return f"/storage/{entity_type}/{entity_id}/{filename}"
63: 
111:         import asyncio
112:         import re
113:         import uuid
114:         entity_type = re.sub(r'[^a-zA-Z0-9_-]', '', entity_type)
115:         filename = os.path.basename(filename)
116:         filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
117:         if not filename or filename in ('.', '..'):
118:             filename = f"file_{uuid.uuid4().hex}"
119:         blob_name = f"{entity_type}/{entity_id}/{filename}"
120:         await asyncio.to_thread(self._sync_save, file_content, blob_name)
121:         return f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"
### backend/app/services/document_service.py:75-86,112-121
74: 
75:         filepath = await self.storage_service.save(content, owner_type, owner_id, file.filename)
76: 
77:         document = Document(
78:             owner_type=DocumentOwnerType(owner_type),
79:             owner_id=owner_id,
80:             journal_id=journal_id if owner_type == "student" else None,
81:             file_path=filepath,
82:             file_name=file.filename,
83:             file_type=content_type,
84:             file_size=file_size,
85:             uploaded_by_id=current_user.id
86:         )
87:         self.db.add(document)
111: 
112:     async def delete_document(self, document_id: int) -> bool:
113:         doc = await self.document_repo.get_by_id(document_id)
114:         if not doc:
115:             raise HTTPException(
116:                 status_code=status.HTTP_404_NOT_FOUND,
117:                 detail="Document not found"
118:             )
119: 
120:         await self.storage_service.delete(doc.file_path)
121:         success = await self.document_repo.soft_delete(document_id)
122:         return success

## BUS-05 — Password reset grants can be reused after successful reset
### backend/app/services/auth_service.py:262-270,280-305
261: 
262:         now = datetime.now(timezone.utc)
263:         expire = now + timedelta(minutes=5)
264:         to_encode = {
265:             "sub": email,
266:             "type": "password_reset",
267:             "exp": int(expire.timestamp()),
268:             "iat": int(now.timestamp())
269:         }
270:         reset_token = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")
271:         return reset_token
279: 
280:         try:
281:             payload = jwt.decode(reset_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
282:             token_type = payload.get("type")
283:             if token_type != "password_reset":
284:                 raise HTTPException(
285:                     status_code=status.HTTP_400_BAD_REQUEST,
286:                     detail="Invalid token type"
287:                 )
288:             email = payload.get("sub")
289:         except JWTError:
290:             raise HTTPException(
291:                 status_code=status.HTTP_400_BAD_REQUEST,
292:                 detail="Invalid or expired reset token"
293:             )
294: 
295:         user = await self.user_repo.get_by_email(email)
296:         if not user or user.is_deleted:
297:             raise HTTPException(
298:                 status_code=status.HTTP_404_NOT_FOUND,
299:                 detail="User not found"
300:             )
301: 
302:         user.password_hash = hash_password(new_password)
303:         await self.user_repo.update(user)
304: 
305:         await self.revoke_all_user_tokens(user.id)
306: 

## BUS-06 — Reset-code attempts and consumption are not atomic
### backend/app/services/auth_service.py:125-150,236-261
124:         key = f"auth:code:{email}"
125:         raw_data = await redis_client.get(key)
126:         if not raw_data:
127:             raise HTTPException(
128:                 status_code=status.HTTP_400_BAD_REQUEST,
129:                 detail="Verification code expired or not requested"
130:             )
131: 
132:         data = json.loads(raw_data)
133:         if data.get("attempts", 0) >= 5:
134:             await redis_client.delete(key)
135:             raise HTTPException(
136:                 status_code=status.HTTP_400_BAD_REQUEST,
137:                 detail="Too many incorrect attempts. Code invalidated."
138:             )
139: 
140:         data["attempts"] += 1
141:         await redis_client.set(key, json.dumps(data), keepttl=True)
142: 
143:         if data["code"] != code:
144:             raise HTTPException(
145:                 status_code=status.HTTP_400_BAD_REQUEST,
146:                 detail="Invalid verification code"
147:             )
148: 
149:         await redis_client.delete(key)
150: 
151:         user = await self.user_repo.get_by_email(email)
235:         key = f"auth:reset:{email}"
236:         raw_data = await redis_client.get(key)
237:         if not raw_data:
238:             raise HTTPException(
239:                 status_code=status.HTTP_400_BAD_REQUEST,
240:                 detail="Reset code expired or not requested"
241:             )
242: 
243:         data = json.loads(raw_data)
244:         if data.get("attempts", 0) >= 5:
245:             await redis_client.delete(key)
246:             raise HTTPException(
247:                 status_code=status.HTTP_400_BAD_REQUEST,
248:                 detail="Too many incorrect attempts. Reset code invalidated."
249:             )
250: 
251:         data["attempts"] += 1
252:         await redis_client.set(key, json.dumps(data), keepttl=True)
253: 
254:         if data["code"] != code:
255:             raise HTTPException(
256:                 status_code=status.HTTP_400_BAD_REQUEST,
257:                 detail="Invalid reset code"
258:             )
259: 
260:         await redis_client.delete(key)
261: 
262:         now = datetime.now(timezone.utc)

## BUS-07 — Reminder calculations still use the retired payment model
### backend/app/workers/tasks.py:209-225
208:                 for enroll in enrollments:
209:                     pay_stmt = select(
210:                         func.coalesce(
211:                             func.sum(
212:                                 Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))
213:                             ),
214:                             Decimal("0.0")
215:                         )
216:                     ).filter(
217:                         Payment.student_id == student.id,
218:                         Payment.course_id == enroll.course_id,
219:                         Payment.paid_at >= start_dt,
220:                         Payment.paid_at <= end_dt
221:                     )
222:                     pay_res = await db.execute(pay_stmt)
223:                     total_paid = pay_res.scalar() or Decimal("0.0")
224: 
225:                     if total_paid < enroll.price_at_enrollment:
226:                         recipient = str(student.parent_telegram_chat_id)

## BUS-08 — Reminder logs mark queue acceptance as successful delivery
### backend/app/workers/tasks.py:42-46,235-251
41:     await email_service.send_email(to_email, subject, body)
42: 
43: 
44: async def send_telegram_message(ctx, chat_id: int, text: str) -> None:
45:     try:
46:         await bot.send_message(chat_id, text)
47:     except (TelegramForbiddenError, TelegramBadRequest) as e:
234: 
235:                         async def send_func(is_update: bool) -> None:
236:                             due_date_str = next_due_date.strftime("%Y-%m-%d")
237:                             if diff_days == 2:
238:                                 text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 2 дня (дата: {due_date_str})"
239:                             else:
240:                                 text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 1 день (дата: {due_date_str})"
241:                             
242:                             from app.core.redis import enqueue_job
243:                             await enqueue_job("send_telegram_message", chat_id=student.parent_telegram_chat_id, text=text)
244: 
245:                         await notification_service.send_notification_with_idempotency(
246:                             recipient=recipient,
247:                             notification_type=notif_type,
248:                             related_entity_id=enroll.id,
249:                             notification_date=today_date,
250:                             send_func=send_func,
251:                             user_id=student.id
252:                         )
### backend/app/services/notification_service.py:120-129
119: 
120:         try:
121:             await send_func(is_update)
122:             log.status = NotificationStatus.SENT
123:             log.sent_at = datetime.now(timezone.utc)
124:             if score_val is not None:
125:                 log.error_message = f"score:{score_val}"
126:             else:
127:                 log.error_message = None
128:             await self.db.commit()
129:             return True
130:         except Exception as e:

## BUS-09 — Failed/revised notification rows can be sent by multiple workers
### backend/app/services/notification_service.py:77-102,120-135
76:     ) -> bool:
77:         query = select(NotificationLog).filter(
78:             NotificationLog.recipient == recipient,
79:             NotificationLog.type == notification_type,
80:             NotificationLog.related_entity_id == related_entity_id,
81:             NotificationLog.notification_date == notification_date
82:         )
83:         result = await self.db.execute(query)
84:         log = result.scalars().first()
85: 
86:         is_update = False
87:         if log:
88:             if user_id is not None and log.user_id is None:
89:                 log.user_id = user_id
90:             if log.status == NotificationStatus.SENT:
91:                 if check_revision_func:
92:                     is_revised = await check_revision_func()
93:                     if not is_revised:
94:                         return False
95:                     is_update = True
96:                 else:
97:                     return False
98:             elif log.attempts >= 3:
99:                 return False
100: 
101:             log.attempts += 1
102:             await self.db.commit()
103:         else:
119: 
120:         try:
121:             await send_func(is_update)
122:             log.status = NotificationStatus.SENT
123:             log.sent_at = datetime.now(timezone.utc)
124:             if score_val is not None:
125:                 log.error_message = f"score:{score_val}"
126:             else:
127:                 log.error_message = None
128:             await self.db.commit()
129:             return True
130:         except Exception as e:
131:             log.status = NotificationStatus.FAILED
132:             log.error_message = str(e)
133:             await self.db.commit()
134:             if log.attempts < 3:
135:                 raise Retry(defer=5 * log.attempts)
136:             return False

## BUS-10 — Exam notifications collide for siblings and suppress document-only updates
### backend/app/workers/tasks.py:87-101,127-134,138-139
86:         notification_service = NotificationService(db)
87:         recipient = str(student.parent_telegram_chat_id)
88:         notification_date = date.today()
89: 
90:         async def check_revision_func() -> bool:
91:             log_stmt = select(NotificationLog).filter(
92:                 NotificationLog.recipient == recipient,
93:                 NotificationLog.type == NotificationType.EXAM_RESULT,
94:                 NotificationLog.related_entity_id == journal_id,
95:                 NotificationLog.notification_date == notification_date
96:             )
97:             log_res = await db.execute(log_stmt)
98:             existing_log = log_res.scalars().first()
99:             if existing_log and existing_log.error_message != f"score:{summary.sum_score}":
100:                 return True
101:             return False
102: 
126:             recipient=recipient,
127:             notification_type=NotificationType.EXAM_RESULT,
128:             related_entity_id=journal_id,
129:             notification_date=notification_date,
130:             send_func=send_func,
131:             check_revision_func=check_revision_func,
132:             score_val=summary.sum_score,
133:             user_id=student.id
134:         )
135: 
137: async def send_student_document_notification_task(ctx, student_id: int, journal_id: int) -> None:
138:     await send_exam_result_notification_task(ctx, student_id, journal_id)
139: 
140: 

## BUS-11 — Jobs and analytics invalidation run before the business transaction commits
### backend/app/services/journal_service.py:631-639
630: 
631:         sum_service = SumCalculationService(self.db)
632:         await sum_service.recalculate(journal_id, student_id)
633: 
634:         from app.core.redis import enqueue_job
635:         try:
636:             await enqueue_job("send_exam_result_notification_task", student_id, journal_id)
637:         except Exception:
638:             pass
639: 
640:         await self.db.refresh(summary)
### backend/app/services/document_service.py:94-107
93:                 JournalStudentSummary.student_id == owner_id
94:             )
95:             summary_res = await self.db.execute(summary_query)
96:             summary = summary_res.scalars().first()
97:             if summary and summary.exam_score > 0:
98:                 from arq import create_pool
99:                 from arq.connections import RedisSettings
100:                 from app.core.config import settings
101:                 if not settings.TESTING:
102:                     try:
103:                         redis_settings = RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
104:                         pool = await create_pool(redis_settings)
105:                         await pool.enqueue_job("send_student_document_notification_task", owner_id, journal_id)
106:                     except Exception:
107:                         pass
108: 
### backend/app/services/finance_service.py:543,606,645,714,783,857
542:         )
543:         await self._invalidate_cache()
544:         return await self._load_entry(entry.id)
605:         )
606:         await self._invalidate_cache()
607:         return await self._load_entry(entry.id)
644:         )
645:         await self._invalidate_cache()
646:         return await self._load_entry(entry.id)
713:         )
714:         await self._invalidate_cache()
715:         return await self._load_entry(void_entry.id)
782:         )
783:         await self._invalidate_cache()
784:         return await self._load_entry(refund_entry.id)
856:         )
857:         await self._invalidate_cache()
858:         return await self._load_entry(last_entry_id) if last_entry_id else None
### backend/app/services/enrollment_service.py:133-169
132:         from app.services.finance_service import FinanceService
133:         finance_service = FinanceService(self.db)
134:         await finance_service.generate_schedule_for_enrollment(enrollment.id)
135: 
136:         await self.db.refresh(enrollment)
137:         return enrollment
138: 
139:     async def withdraw_student(self, enrollment_id: int) -> Enrollment:
140:         enrollment = await self.enrollment_repo.get_by_id(enrollment_id)
141:         if not enrollment or enrollment.is_deleted:
142:             raise HTTPException(
143:                 status_code=status.HTTP_404_NOT_FOUND,
144:                 detail="Enrollment not found"
145:             )
146:         enrollment.status = EnrollmentStatus.WITHDRAWN
147:         await self.enrollment_repo.update(enrollment)
148: 
149:         # Cancel unbilled future open charges upon withdrawal. Charges already
150:         # due stay as debt.
151:         from app.models.charge import Charge, ChargeStatus
152:         from app.services.finance_service import get_dushanbe_today
153:         today = get_dushanbe_today()
154:         cancel_q = select(Charge).filter(
155:             Charge.enrollment_id == enrollment_id,
156:             Charge.due_date > today,
157:             Charge.status == ChargeStatus.OPEN,
158:             Charge.is_deleted == False
159:         )
160:         c_res = await self.db.execute(cancel_q)
161:         future_charges = list(c_res.scalars().all())
162:         for fc in future_charges:
163:             fc.status = ChargeStatus.CANCELLED
164: 
165:         await self.db.refresh(enrollment)
166:         return enrollment
167: 
168:     async def list_enrollments(
169:         self,
170:         filters: dict,

## BUS-12 — Journal completion counts precreated empty entries as graded cells
### backend/app/services/journal_service.py:55-62,79-92,181-183
54: 
55:         entry_counts_stmt = select(
56:             JournalEntry.journal_id,
57:             func.count(JournalEntry.id)
58:         ).filter(
59:             JournalEntry.journal_id.in_(journal_ids)
60:         ).group_by(JournalEntry.journal_id)
61:         entry_counts_res = await self.db.execute(entry_counts_stmt)
62:         entry_counts_map = dict(entry_counts_res.all())
63: 
78:             lesson_dates = get_lesson_dates(j.period_start, j.period_end, schedules)
79:             lesson_count = len(lesson_dates)
80:             cells_expected = student_count * lesson_count
81:             cells_filled = entry_counts_map.get(j.id, 0)
82:             raw_avg = summary_avg_map.get(j.id)
83:             avg_percentage = round(float(raw_avg), 1) if raw_avg is not None else None
84: 
85:             if j.period_start > today:
86:                 state = "upcoming"
87:             elif cells_filled == 0:
88:                 state = "empty"
89:             elif cells_expected > 0 and cells_filled >= cells_expected:
90:                 state = "complete"
91:             else:
92:                 state = "partial"
93: 
180:             for j in journals:
181:                 if j.state in ("empty", "partial") and j.period_start <= today:
182:                     is_current = j.period_start <= today <= j.period_end
183:                     queue.append(GradingQueueItemResponse(
184:                         journal_id=j.id,
### backend/app/services/enrollment_service.py:99-111
98:         summaries_to_add = []
99:         for journal in journals:
100:             lesson_dates = get_lesson_dates(journal.period_start, journal.period_end, schedules)
101:             for l_date in lesson_dates:
102:                 entries_to_add.append(JournalEntry(
103:                     journal_id=journal.id,
104:                     student_id=student_id,
105:                     lesson_date=l_date,
106:                     attendance=False,
107:                     score=0,
108:                     comment=None,
109:                     version=1
110:                 ))
111: 
112:             summaries_to_add.append(JournalStudentSummary(

## BUS-13 — Optimistic conflicts escape the journal's 409 handling
### backend/app/services/journal_service.py:479-512,622-632,708-724
478: 
479:             if changes:
480:                 entry.attendance = target_attendance
481:                 entry.score = update_item.score
482:                 entry.comment = update_item.comment
483: 
484:                 await audit_service.log(
485:                     user_id=current_user.id,
486:                     action="update",
487:                     entity_type="journal_entry",
488:                     entity_id=entry.id,
489:                     changes=changes
490:                 )
491: 
492:             updated_student_ids.add(update_item.student_id)
493:             applied_entries.append(entry)
494: 
495:         if conflicts and not applied_entries:
496:             raise HTTPException(
497:                 status_code=status.HTTP_409_CONFLICT,
498:                 detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
499:             )
500: 
501:         try:
502:             await self.db.flush()
503:         except StaleObjectError:
504:             await self.db.rollback()
505:             raise HTTPException(
506:                 status_code=status.HTTP_409_CONFLICT,
507:                 detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
508:             )
509: 
510:         if updated_student_ids:
511:             sum_service = SumCalculationService(self.db)
512:             await sum_service.recalculate_journal(journal_id)
513: 
621: 
622:         try:
623:             await self.db.flush()
624:         except StaleObjectError:
625:             await self.db.rollback()
626:             raise HTTPException(
627:                 status_code=status.HTTP_409_CONFLICT,
628:                 detail="Conflict: The summary has been updated by another user. Please refresh and try again."
629:             )
630: 
631:         sum_service = SumCalculationService(self.db)
632:         await sum_service.recalculate(journal_id, student_id)
633: 
707:         old_exam_max_score = journal.exam_max_score
708:         journal.exam_max_score = exam_max_score
709: 
710:         sum_service = SumCalculationService(self.db)
711:         await sum_service.recalculate_journal(journal_id)
712: 
713:         from app.services.audit_service import AuditService
714:         audit_service = AuditService(self.db)
715:         await audit_service.log(
716:             user_id=current_user.id,
717:             action="update",
718:             entity_type="journal",
719:             entity_id=journal.id,
720:             changes={"exam_max_score": (old_exam_max_score, exam_max_score)}
721:         )
722: 
723:         await self.db.flush()
724:         await self.db.refresh(journal)
725: 
### backend/app/services/audit_service.py:37-43
36:                 self.db.add(audit_log)
37:             await self.db.flush()
38:         except Exception:
39:             # Audit must not break the operation being audited, but a silent
40:             # swallow makes "everything is audited" unverifiable — log it.
41:             logger.exception(
42:                 "Failed to write audit log for %s #%s (action=%s)", entity_type, entity_id, action
43:             )
44: 
### backend/app/services/sum_calculation_service.py:118
117: 
118:         await self.db.flush()

## BUS-14 — Configured cloud storage is bypassed by business services and workers
### backend/app/services/document_service.py:38
37:         self.document_repo = SQLAlchemyDocumentRepository(db)
38:         self.storage_service = LocalStorageService()
39: 
### backend/app/services/course_service.py:187
186: 
187:         storage_service = LocalStorageService()
188:         if course.photo_path:
### backend/app/services/user_service.py:194
193: 
194:         storage_service = LocalStorageService()
195:         if user.photo_path:
### backend/app/workers/tasks.py:110-119
109:                 if document.file_size > 50 * 1024 * 1024:
110:                     storage_service = LocalStorageService()
111:                     url = await storage_service.get_url(document.file_path)
112:                     full_text = f"{text}\nСсылка на документ: {url}"
113:                     await bot.send_message(student.parent_telegram_chat_id, full_text)
114:                 else:
115:                     storage_service = LocalStorageService()
116:                     abs_path = storage_service._get_absolute_path(document.file_path)
117:                     if os.path.exists(abs_path):
118:                         document_file = FSInputFile(abs_path, filename=document.file_name)
119:                         await bot.send_document(student.parent_telegram_chat_id, document_file, caption=text)
120:                     else:
### backend/app/services/storage_service.py:139-143
138: 
139: def get_storage_service() -> StorageService:
140:     if settings.GCS_BUCKET_NAME:
141:         return GoogleCloudStorageService(bucket_name=settings.GCS_BUCKET_NAME)
142:     return LocalStorageService()
143: 

## BUS-15 — Password hashing and avatar transformation block async request execution
### backend/app/core/security.py:9-21
8: 
9: def hash_password(password: str) -> str:
10:     pwd_bytes = password.encode("utf-8")
11:     salt = bcrypt.gensalt(rounds=12)
12:     return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")
13: 
14: 
15: def verify_password(plain_password: str, hashed_password: str) -> bool:
16:     pwd_bytes = plain_password.encode("utf-8")
17:     hashed_bytes = hashed_password.encode("utf-8")
18:     try:
19:         return bcrypt.checkpw(pwd_bytes, hashed_bytes)
20:     except ValueError:
21:         return False
22: 
### backend/app/services/auth_service.py:33,194,302
32: 
33:         if not user.password_hash or not verify_password(password, user.password_hash):
34:             raise HTTPException(
193: 
194:         user.password_hash = hash_password(new_password)
195:         user.must_set_password = False
301: 
302:         user.password_hash = hash_password(new_password)
303:         await self.user_repo.update(user)
### backend/app/services/user_service.py:169-208
168:                 status_code=status.HTTP_413_CONTENT_TOO_LARGE,
169:                 detail="Avatar size exceeds the 5MB limit"
170:             )
171:         try:
172:             # verify() consumes the file handle; open the image again below
173:             image = Image.open(io.BytesIO(content))
174:             image.verify()
175:         except Exception:
176:             raise HTTPException(
177:                 status_code=status.HTTP_400_BAD_REQUEST,
178:                 detail="Invalid image file"
179:             )
180: 
181:         image = Image.open(io.BytesIO(content))
182:         if image.format not in ["PNG", "JPEG"]:
183:             raise HTTPException(
184:                 status_code=status.HTTP_400_BAD_REQUEST,
185:                 detail="Unsupported image format. PNG or JPEG only."
186:             )
187: 
188:         image.thumbnail((200, 200))
189: 
190:         out_io = io.BytesIO()
191:         image.save(out_io, format=image.format)
192:         resized_bytes = out_io.getvalue()
193: 
194:         storage_service = LocalStorageService()
195:         if user.photo_path:
196:             await storage_service.delete(user.photo_path)
197:         if user.thumbnail_path:
198:             await storage_service.delete(user.thumbnail_path)
199: 
200:         ext = "png" if image.format == "PNG" else "jpg"
201:         # Save full-size original as photo_path
202:         filename = f"avatar.{ext}"
203:         new_path = await storage_service.save(resized_bytes, "avatar", user_id, filename)
204: 
205:         # Save the thumbnail
206:         thumb = Image.open(io.BytesIO(content))
207:         thumb.thumbnail((200, 200))
208:         thumb_io = io.BytesIO()
209:         thumb.save(thumb_io, format=thumb.format or image.format)

## BUS-16 — Rounded installment generation can create nonpositive charges
### backend/app/services/finance_service.py:432-450
431: 
432:         total_months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month) + 1
433:         total_months = max(1, total_months)
434: 
435:         price = Decimal(enrollment.price_at_enrollment)
436:         base = (price / Decimal(total_months)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
437: 
438:         payment_day = student.payment_day_of_month or min(28, course.start_date.day)
439: 
440:         charges: List[Charge] = []
441:         accumulated = ZERO
442:         year, month = start_date.year, start_date.month
443: 
444:         for index in range(total_months):
445:             sequence_no = index + 1
446:             if sequence_no == total_months:
447:                 amount = price - accumulated
448:             else:
449:                 amount = base
450:                 accumulated += amount
451: 

## BUS-17 — Parent Telegram linking searches the student's phone instead of parent phone
### backend/app/telegram_bot/handlers/start.py:25-40,52-57
24: async def process_contact(message: types.Message) -> None:
25:     if message.contact.user_id != message.from_user.id:
26:         await message.answer(
27:             "Вы можете поделиться только своим собственным контактом."
28:         )
29:         return
30:     phone = message.contact.phone_number
31:     cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
32:     if cleaned and not cleaned.startswith("+"):
33:         cleaned = "+" + cleaned
34:     
35:     cleaned_without = cleaned.lstrip("+")
36:     
37:     async with AsyncSessionLocal() as db:
38:         query = select(User).filter(
39:             User.role == UserRole.STUDENT,
40:             User.phone.in_([cleaned, cleaned_without]),
41:             User.is_deleted == False
51:         
52:         student_names = []
53:         for student in students:
54:             student.parent_telegram_chat_id = message.chat.id
55:             student_names.append(f"{student.first_name} {student.last_name}")
56:         
57:         await db.commit()
58:         

## BUS-18 — Organization notification switches are saved but never enforced
### backend/app/services/settings_service.py:31-34
30:             settings.org_name = data.org_name
31:         if data.notify_payments is not None:
32:             settings.notify_payments = data.notify_payments
33:         if data.notify_debts is not None:
34:             settings.notify_debts = data.notify_debts
35: 
### backend/app/workers/tasks.py:154-166,224-251
153: 
154: async def check_payment_reminders(ctx) -> None:
155:     async with AsyncSessionLocal() as db:
156:         students_stmt = select(User).filter(
157:             User.role == UserRole.STUDENT,
158:             User.parent_telegram_chat_id.isnot(None),
159:             User.payment_day_of_month.isnot(None),
160:             User.is_deleted == False
161:         )
162:         students_res = await db.execute(students_stmt)
163:         students = students_res.scalars().all()
164: 
165:         tz = zoneinfo.ZoneInfo(settings.TIMEZONE)
166:         now_in_tz = datetime.now(tz)
167:         today_date = now_in_tz.date()
223:                     total_paid = pay_res.scalar() or Decimal("0.0")
224: 
225:                     if total_paid < enroll.price_at_enrollment:
226:                         recipient = str(student.parent_telegram_chat_id)
227:                         notif_type = (
228:                             NotificationType.PAYMENT_REMINDER_2D
229:                             if diff_days == 2
230:                             else NotificationType.PAYMENT_REMINDER_1D
231:                         )
232:                         
233:                         notification_service = NotificationService(db)
234: 
235:                         async def send_func(is_update: bool) -> None:
236:                             due_date_str = next_due_date.strftime("%Y-%m-%d")
237:                             if diff_days == 2:
238:                                 text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 2 дня (дата: {due_date_str})"
239:                             else:
240:                                 text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 1 день (дата: {due_date_str})"
241:                             
242:                             from app.core.redis import enqueue_job
243:                             await enqueue_job("send_telegram_message", chat_id=student.parent_telegram_chat_id, text=text)
244: 
245:                         await notification_service.send_notification_with_idempotency(
246:                             recipient=recipient,
247:                             notification_type=notif_type,
248:                             related_entity_id=enroll.id,
249:                             notification_date=today_date,
250:                             send_func=send_func,
251:                             user_id=student.id
252:                         )

## BUS-19 — Optional: Narrow service dependencies and split finance responsibilities
### backend/app/services/auth_service.py:19-23
18: class AuthService:
19:     def __init__(self, db: AsyncSession) -> None:
20:         self.db = db
21:         self.user_repo = SQLAlchemyUserRepository(db)
22:         self.token_repo = SQLAlchemyRefreshTokenRepository(db)
23:         self.email_service = EmailService()
24: 
### backend/app/services/course_service.py:20-23
19: class CourseService:
20:     def __init__(self, db: AsyncSession) -> None:
21:         self.db = db
22:         self.course_repo = SQLAlchemyCourseRepository(db)
23:         self.user_repo = SQLAlchemyUserRepository(db)
24: 
### backend/app/services/finance_service.py:76-78,1198-1349,1597-1661
75: class FinanceService:
76:     def __init__(self, db: AsyncSession) -> None:
77:         self.db = db
78: 
79:     # ------------------------------------------------------------------
1197:             items.append(
1198:                 {
1199:                     "student": {
1200:                         "id": student.id,
1201:                         "first_name": student.first_name,
1202:                         "last_name": student.last_name,
1203:                         "email": student.email,
1204:                         "payment_day_of_month": student.payment_day_of_month,
1205:                     },
1206:                     "course": {"id": course.id, "title": course.title},
1207:                     "price_at_enrollment": enrollment.price_at_enrollment,
1208:                     "billed_to_date": Decimal(billed or 0),
1209:                     "total_paid": Decimal(allocated or 0),
1210:                     "debt": Decimal(debt or 0),
1211:                     "overdue_days": max(0, int(overdue_days or 0)),
1212:                 }
1213:             )
1214: 
1215:         return {
1216:             "items": items,
1217:             "total": total,
1218:             "page": page,
1219:             "page_size": page_size,
1220:             "total_pages": total_pages,
1221:         }
1222: 
1223:     async def get_analytics(self, date_from: date, date_to: date) -> dict:
1224:         cache_key = f"finance:analytics:{date_from.isoformat()}:{date_to.isoformat()}"
1225:         cached = await redis_client.get(cache_key)
1226:         if cached:
1227:             return json.loads(cached)
1228: 
1229:         today = get_dushanbe_today()
1230:         active_enrollment = and_(
1231:             Enrollment.status == EnrollmentStatus.ACTIVE,
1232:             Enrollment.is_deleted == False,  # noqa: E712
1233:         )
1234:         billed_to_date_clause = and_(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED)
1235: 
1236:         gross_res = await self.db.execute(
1237:             select(func.coalesce(func.sum(Charge.amount), ZERO))
1238:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1239:             .filter(active_enrollment, Charge.is_deleted == False, Charge.status != ChargeStatus.CANCELLED)  # noqa: E712
1240:         )
1241:         gross_contract_value = Decimal(gross_res.scalar() or 0)
1242: 
1243:         billed_res = await self.db.execute(
1244:             select(func.coalesce(func.sum(Charge.amount), ZERO))
1245:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1246:             .filter(active_enrollment, Charge.is_deleted == False, billed_to_date_clause)  # noqa: E712
1247:         )
1248:         billed_to_date = Decimal(billed_res.scalar() or 0)
1249: 
1250:         settled_res = await self.db.execute(
1251:             select(func.coalesce(func.sum(Allocation.amount), ZERO))
1252:             .join(Charge, Charge.id == Allocation.charge_id)
1253:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1254:             .filter(
1255:                 active_enrollment,
1256:                 Charge.is_deleted == False,  # noqa: E712
1257:                 billed_to_date_clause,
1258:                 Allocation.reversed_by_entry_id.is_(None),
1259:             )
1260:         )
1261:         settled_to_date = Decimal(settled_res.scalar() or 0)
1262:         net_receivable = max(ZERO, billed_to_date - settled_to_date)
1263: 
1264:         # Period bounds: local Dushanbe midnight-to-midnight, expressed in UTC.
1265:         dt_from = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc) - DUSHANBE_TZ_OFFSET
1266:         dt_to = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc) - DUSHANBE_TZ_OFFSET
1267: 
1268:         in_period = and_(LedgerEntry.occurred_at >= dt_from, LedgerEntry.occurred_at <= dt_to)
1269:         voided = self._voided_ids_subquery()
1270: 
1271:         collected_res = await self.db.execute(
1272:             select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
1273:                 LedgerEntry.type == LedgerEntryType.PAYMENT,
1274:                 LedgerEntry.id.notin_(voided),
1275:                 in_period,
1276:             )
1277:         )
1278:         payments_collected = Decimal(collected_res.scalar() or 0)
1279: 
1280:         refunds_res = await self.db.execute(
1281:             select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
1282:                 LedgerEntry.type == LedgerEntryType.REFUND,
1283:                 LedgerEntry.is_cash_out.is_(True),
1284:                 in_period,
1285:             )
1286:         )
1287:         refunds_paid_out = Decimal(refunds_res.scalar() or 0)
1288:         collected_in_period = payments_collected - refunds_paid_out
1289: 
1290:         # Like-for-like denominator: what fell due inside the same window.
1291:         billed_in_period_res = await self.db.execute(
1292:             select(func.coalesce(func.sum(Charge.amount), ZERO))
1293:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1294:             .filter(
1295:                 active_enrollment,
1296:                 Charge.is_deleted == False,  # noqa: E712
1297:                 Charge.status != ChargeStatus.CANCELLED,
1298:                 Charge.due_date >= date_from,
1299:                 Charge.due_date <= date_to,
1300:             )
1301:         )
1302:         billed_in_period = Decimal(billed_in_period_res.scalar() or 0)
1303: 
1304:         outstanding_credit = await self._total_outstanding_credit()
1305:         aging = await self._aging_buckets(today)
1306: 
1307:         debt_query, debt_expr = self._debt_query(today, {})
1308:         debt_sub = debt_query.subquery()
1309:         unpaid_res = await self.db.execute(
1310:             select(func.count(func.distinct(debt_sub.c.student_id))).select_from(debt_sub)
1311:         )
1312:         unpaid_students_count = unpaid_res.scalar() or 0
1313: 
1314:         top_debtors = await self.get_debts(filters={}, page=1, page_size=10)
1315:         debtors_preview = [
1316:             {
1317:                 "student_id": item["student"]["id"],
1318:                 "first_name": item["student"]["first_name"],
1319:                 "last_name": item["student"]["last_name"],
1320:                 "email": item["student"]["email"],
1321:                 "debt": float(item["debt"]),
1322:             }
1323:             for item in top_debtors["items"]
1324:         ]
1325: 
1326:         collection_rate = (
1327:             float((collected_in_period / billed_in_period).quantize(Decimal("0.0001")))
1328:             if billed_in_period > 0
1329:             else 0.0
1330:         )
1331: 
1332:         analytics = {
1333:             "gross_contract_value": float(gross_contract_value),
1334:             "billed_to_date": float(billed_to_date),
1335:             "billed_in_period": float(billed_in_period),
1336:             "net_receivable": float(net_receivable),
1337:             "collected_in_period": float(collected_in_period),
1338:             "outstanding_credit": float(outstanding_credit),
1339:             "aging": {
1340:                 "d0_30": float(aging[0]),
1341:                 "d31_60": float(aging[1]),
1342:                 "d61_90": float(aging[2]),
1343:                 "d90_plus": float(aging[3]),
1344:             },
1345:             "unpaid_students_count": int(unpaid_students_count),
1346:             "collection_rate": collection_rate,
1347:             "debtors_preview": debtors_preview,
1348:         }
1349: 
1350:         await redis_client.set(cache_key, json.dumps(analytics), ex=600)
1596: 
1597:     async def close_period(
1598:         self, year: int, month: int, payload: ClosePeriodPayload, current_user: User
1599:     ) -> AccountingPeriod:
1600:         if current_user.role != UserRole.SUPERADMIN:
1601:             raise HTTPException(
1602:                 status_code=status.HTTP_403_FORBIDDEN,
1603:                 detail="Only SuperAdmin can close accounting periods",
1604:             )
1605: 
1606:         res = await self.db.execute(
1607:             select(AccountingPeriod).filter(AccountingPeriod.year == year, AccountingPeriod.month == month)
1608:         )
1609:         period = res.scalars().first()
1610:         if not period:
1611:             period = AccountingPeriod(year=year, month=month)
1612:             self.db.add(period)
1613:             await self.db.flush()
1614: 
1615:         period.status = AccountingPeriodStatus.CLOSED
1616:         period.closed_by_id = current_user.id
1617:         period.closed_at = datetime.now(timezone.utc)
1618:         period.reopen_reason = None
1619:         await self.db.flush()
1620:         await self.db.refresh(period)
1621: 
1622:         await self._log_audit(
1623:             user_id=current_user.id,
1624:             action="close_period",
1625:             entity_type="accounting_period",
1626:             entity_id=period.id,
1627:             changes={"year": year, "month": month, "status": ("open", "closed")},
1628:         )
1629:         return period
1630: 
1631:     async def reopen_period(
1632:         self, year: int, month: int, payload: ReopenPeriodPayload, current_user: User
1633:     ) -> AccountingPeriod:
1634:         if current_user.role != UserRole.SUPERADMIN:
1635:             raise HTTPException(
1636:                 status_code=status.HTTP_403_FORBIDDEN,
1637:                 detail="Only SuperAdmin can reopen accounting periods",
1638:             )
1639: 
1640:         res = await self.db.execute(
1641:             select(AccountingPeriod).filter(AccountingPeriod.year == year, AccountingPeriod.month == month)
1642:         )
1643:         period = res.scalars().first()
1644:         if not period:
1645:             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accounting period not found")
1646: 
1647:         period.status = AccountingPeriodStatus.OPEN
1648:         period.reopen_reason = payload.reason_code
1649:         period.closed_by_id = None
1650:         period.closed_at = None
1651:         await self.db.flush()
1652:         await self.db.refresh(period)
1653: 
1654:         await self._log_audit(
1655:             user_id=current_user.id,
1656:             action="reopen_period",
1657:             entity_type="accounting_period",
1658:             entity_id=period.id,
1659:             changes={"year": year, "month": month, "status": ("closed", "open"), "reason_code": payload.reason_code},
1660:         )
1661:         return period
### backend/app/services/journal_service.py:392-409,565-582,666-683
391: 
392:         if current_user.role == UserRole.SUPERADMIN:
393:             pass
394:         elif current_user.role == UserRole.MENTOR:
395:             if course.mentor_id != current_user.id:
396:                 raise HTTPException(
397:                     status_code=status.HTTP_403_FORBIDDEN,
398:                     detail="Not enough permissions"
399:                 )
400:             if course.status == CourseStatus.ARCHIVED:
401:                 raise HTTPException(
402:                     status_code=status.HTTP_403_FORBIDDEN,
403:                     detail="Cannot update archived course"
404:                 )
405:         else:
406:             raise HTTPException(
407:                 status_code=status.HTTP_403_FORBIDDEN,
408:                 detail="Not enough permissions"
409:             )
410: 
564:         if current_user.role == UserRole.SUPERADMIN:
565:             pass
566:         elif current_user.role == UserRole.MENTOR:
567:             if course.mentor_id != current_user.id:
568:                 raise HTTPException(
569:                     status_code=status.HTTP_403_FORBIDDEN,
570:                     detail="Not enough permissions"
571:                 )
572:             if course.status == CourseStatus.ARCHIVED:
573:                 raise HTTPException(
574:                     status_code=status.HTTP_403_FORBIDDEN,
575:                     detail="Cannot update archived course"
576:                 )
577:         else:
578:             raise HTTPException(
579:                 status_code=status.HTTP_403_FORBIDDEN,
580:                 detail="Not enough permissions"
581:             )
582: 
583:         if exam_score < 0 or bonus_score < 0:
665:         if current_user.role == UserRole.SUPERADMIN:
666:             pass
667:         elif current_user.role == UserRole.MENTOR:
668:             if course.mentor_id != current_user.id:
669:                 raise HTTPException(
670:                     status_code=status.HTTP_403_FORBIDDEN,
671:                     detail="Not enough permissions"
672:                 )
673:             if course.status == CourseStatus.ARCHIVED:
674:                 raise HTTPException(
675:                     status_code=status.HTTP_403_FORBIDDEN,
676:                     detail="Cannot update archived course"
677:                 )
678:         else:
679:             raise HTTPException(
680:                 status_code=status.HTTP_403_FORBIDDEN,
681:                 detail="Not enough permissions"
682:             )
683: 
684:         if not (0 <= exam_max_score <= EXAM_MAX_SCORE_LIMIT):

## BUS-20 — Optional: Remove repeated queries and unbounded materialization from reporting/jobs
### backend/app/services/finance_service.py:294-295,1004-1019,1510-1550
293:         touched: List[int] = []
294:         for entry in entries:
295:             available = await self._entry_available(entry)
296:             if available <= ZERO:
1003:         entries_res = await self.db.execute(
1004:             select(LedgerEntry)
1005:             .filter(LedgerEntry.student_id == student_id)
1006:             .order_by(LedgerEntry.occurred_at.asc(), LedgerEntry.id.asc())
1007:         )
1008:         entries = list(entries_res.scalars().all())
1009: 
1010:         charges_res = await self.db.execute(
1011:             select(Charge)
1012:             .filter(Charge.student_id == student_id, Charge.is_deleted == False)  # noqa: E712
1013:             .order_by(Charge.due_date.asc())
1014:         )
1015:         charges = list(charges_res.scalars().all())
1016: 
1017:         result: List[dict] = []
1018:         for charge in charges:
1019:             remaining = await self._charge_remaining(charge)
1020:             result.append(
1509:             return []
1510: 
1511:         cash_out_res = await self.db.execute(
1512:             select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
1513:             .filter(LedgerEntry.type == LedgerEntryType.REFUND, LedgerEntry.is_cash_out.is_(True))
1514:             .group_by(LedgerEntry.student_id)
1515:         )
1516:         cash_out = {row[0]: Decimal(row[1] or 0) for row in cash_out_res.all()}
1517: 
1518:         allocated_res = await self.db.execute(
1519:             select(LedgerEntry.student_id, func.coalesce(func.sum(Allocation.amount), ZERO))
1520:             .join(Allocation, Allocation.ledger_entry_id == LedgerEntry.id)
1521:             .filter(
1522:                 LedgerEntry.type.in_(CREDIT_TYPES),
1523:                 LedgerEntry.id.notin_(voided),
1524:                 Allocation.reversed_by_entry_id.is_(None),
1525:             )
1526:             .group_by(LedgerEntry.student_id)
1527:         )
1528:         allocated = {row[0]: Decimal(row[1] or 0) for row in allocated_res.all()}
1529: 
1530:         balances = {
1531:             sid: amount - cash_out.get(sid, ZERO) - allocated.get(sid, ZERO)
1532:             for sid, amount in credit.items()
1533:         }
1534:         positive = {sid: bal for sid, bal in balances.items() if bal > ZERO}
1535:         if not positive:
1536:             return []
1537: 
1538:         students_res = await self.db.execute(select(User).filter(User.id.in_(list(positive.keys()))))
1539:         return [
1540:             {
1541:                 "student_id": student.id,
1542:                 "student_name": f"{student.first_name} {student.last_name}",
1543:                 "email": student.email,
1544:                 "credit_balance": positive[student.id],
1545:             }
1546:             for student in students_res.scalars().all()
1547:         ]
1548: 
1549:     async def get_payment_receipt(self, payment_id: int) -> dict:
1550:         entry = await self._get_payment_entry(payment_id)
1551: 
### backend/app/services/journal_service.py:172-182
171:         )
172:         courses_res = await self.db.execute(courses_stmt)
173:         courses = list(courses_res.scalars().all())
174: 
175:         today = date.today()
176:         queue: List[GradingQueueItemResponse] = []
177: 
178:         for course in courses:
179:             journals = await self.get_course_journals_aggregated(course.id)
180:             for j in journals:
181:                 if j.state in ("empty", "partial") and j.period_start <= today:
182:                     is_current = j.period_start <= today <= j.period_end
183:                     queue.append(GradingQueueItemResponse(
### backend/app/services/sum_calculation_service.py:71-118
70:             select(JournalEntry).filter(JournalEntry.journal_id == journal_id)
71:         )
72:         entries = list(entries_result.scalars().all())
73: 
74:         entries_by_student: dict[int, list[JournalEntry]] = {}
75:         for entry in entries:
76:             entries_by_student.setdefault(entry.student_id, []).append(entry)
77: 
78:         summaries_result = await self.db.execute(
79:             select(JournalStudentSummary).filter(JournalStudentSummary.journal_id == journal_id)
80:         )
81:         summaries = list(summaries_result.scalars().all())
82:         summaries_by_student: dict[int, JournalStudentSummary] = {s.student_id: s for s in summaries}
83: 
84:         all_student_ids = set(entries_by_student.keys()) | set(summaries_by_student.keys())
85: 
86:         for student_id in all_student_ids:
87:             student_entries = entries_by_student.get(student_id, [])
88:             homework_score = sum(e.score for e in student_entries)
89:             attendance_count = sum(1 for e in student_entries if e.attendance is True)
90:             attendance_score = attendance_count * ATTENDANCE_POINT_PER_LESSON
91:             total_lessons = len(student_entries)
92: 
93:             summary = summaries_by_student.get(student_id)
94:             if not summary:
95:                 summary = JournalStudentSummary(
96:                     journal_id=journal_id,
97:                     student_id=student_id,
98:                     homework_score=0,
99:                     attendance_score=0,
100:                     exam_score=0,
101:                     bonus_score=0,
102:                     sum_score=0,
103:                     max_period_score=0,
104:                     attendance_count=0,
105:                     total_lessons=0,
106:                     version=1
107:                 )
108:                 self.db.add(summary)
109:                 summaries_by_student[student_id] = summary
110: 
111:             summary.homework_score = homework_score
112:             summary.attendance_score = attendance_score
113:             summary.attendance_count = attendance_count
114:             summary.total_lessons = total_lessons
115:             summary.max_period_score = max_period_score(total_lessons, exam_max_score_val)
116:             summary.sum_score = homework_score + attendance_score + summary.exam_score + summary.bonus_score
117: 
118:         await self.db.flush()
### backend/app/workers/tasks.py:156-166,193-222
155:     async with AsyncSessionLocal() as db:
156:         students_stmt = select(User).filter(
157:             User.role == UserRole.STUDENT,
158:             User.parent_telegram_chat_id.isnot(None),
159:             User.payment_day_of_month.isnot(None),
160:             User.is_deleted == False
161:         )
162:         students_res = await db.execute(students_stmt)
163:         students = students_res.scalars().all()
164: 
165:         tz = zoneinfo.ZoneInfo(settings.TIMEZONE)
166:         now_in_tz = datetime.now(tz)
167:         today_date = now_in_tz.date()
192:                 if diff_days not in (1, 2):
193:                     continue
194: 
195:                 enroll_stmt = select(Enrollment).options(
196:                     joinedload(Enrollment.course)
197:                 ).filter(
198:                     Enrollment.student_id == student.id,
199:                     Enrollment.status == EnrollmentStatus.ACTIVE,
200:                     Enrollment.is_deleted == False
201:                 )
202:                 enroll_res = await db.execute(enroll_stmt)
203:                 enrollments = enroll_res.scalars().all()
204: 
205:                 start_dt = datetime.combine(prev_due_date, datetime.min.time()).replace(tzinfo=tz)
206:                 end_dt = datetime.combine(next_due_date, datetime.max.time()).replace(tzinfo=tz)
207: 
208:                 for enroll in enrollments:
209:                     pay_stmt = select(
210:                         func.coalesce(
211:                             func.sum(
212:                                 Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))
213:                             ),
214:                             Decimal("0.0")
215:                         )
216:                     ).filter(
217:                         Payment.student_id == student.id,
218:                         Payment.course_id == enroll.course_id,
219:                         Payment.paid_at >= start_dt,
220:                         Payment.paid_at <= end_dt
221:                     )
222:                     pay_res = await db.execute(pay_stmt)
223:                     total_paid = pay_res.scalar() or Decimal("0.0")

## DATA-01 — Critical: Destructive reset scripts have no environment boundary and install a known administrator password
### backend/scripts/clean_db.py:42–63
41: 
42: async def clean_database():
43:     logger.info("Cleaning database completely...")
44: 
45:     async with engine.begin() as conn:
46:         for tbl in TABLES:
47:             await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
48: 
49:     logger.info("Database truncated successfully.")
50: 
51:     # Seed default superadmin user
52:     async with AsyncSessionLocal() as session:
53:         admin = User(
54:             email="superadmin@mail.com",
55: [credential-bearing source line redacted]
56:             first_name="Admin",
57:             last_name="Super",
58:             role=UserRole.SUPERADMIN,
59: [credential-bearing source line redacted]
60:         )
61:         session.add(admin)
62:         await session.commit()
[credential-bearing source line redacted]
64: 
### backend/scripts/seed_demo_data.py:170–195
169: 
170: async def clean_database_and_storage() -> None:
171:     logger.info("Cleaning database tables...")
172:     async with engine.begin() as conn:
173:         for tbl in TABLES_TO_TRUNCATE:
174:             await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
175:     
176:     if os.path.exists(settings.STORAGE_PATH):
177:         shutil.rmtree(settings.STORAGE_PATH, ignore_errors=True)
178:     os.makedirs(settings.STORAGE_PATH, exist_ok=True)
179:     logger.info("Database and storage cleaned successfully.")
180: 
181: 
182: async def seed_demo_data() -> None:
183:     await clean_database_and_storage()
184: 
185:     async with AsyncSessionLocal() as session:
186: [credential-bearing source line redacted]
187: 
188:         admin_user: User = User(
189:             email="superadmin@mail.com",
190: [credential-bearing source line redacted]
191:             first_name="SuperAdmin",
192:             last_name="System",
193:             role=UserRole.SUPERADMIN,
194:             phone="+992900000000",
195: [credential-bearing source line redacted]
196:         )

## DATA-02 — Critical: Tests flush the application's configured Redis database
### backend/app/tests/conftest.py:24–30,77–80
23: 
24: from app.main import app
25: from app.core.config import settings
26: from app.core.deps import get_db_session
27: from app.core.security import hash_password, create_access_token
28: from app.core.redis import redis_client
29: from app.db.base import Base
30: from app.models.user import User, UserRole
31: from app.models.refresh_token import RefreshToken
76:         
77: @pytest_asyncio.fixture(scope="function")
78: async def db_session() -> AsyncGenerator[AsyncSession, None]:
79:     # Clear Redis rate limits
80:     await redis_client.flushdb()
81: 

## DATA-03 — Critical: Redundant required database fields prevent the documented deployment from starting
### backend/app/core/config.py:38–43,70
37: 
38:     POSTGRES_SERVER: str
39:     POSTGRES_USER: str
40:     POSTGRES_PASSWORD: str
41:     POSTGRES_DB: str
42:     POSTGRES_PORT: int = 5432
43:     DATABASE_URL: str
44: 
69: 
70: settings = Settings()

## DATA-04 — Token lookup does not consume refresh tokens atomically
### backend/app/repositories/sqlalchemy/refresh_token_repository.py:28–36
27: 
28:     async def get_valid_token(self, token_hash: str) -> Optional[RefreshToken]:
29:         now = datetime.now(timezone.utc)
30:         query = select(RefreshToken).filter(
31:             RefreshToken.token_hash == token_hash,
32:             RefreshToken.revoked_at == None,
33:             RefreshToken.expires_at > now
34:         )
35:         result = await self.session.execute(query)
36:         return result.scalars().first()
### backend/app/models/refresh_token.py:13
12:     user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
13:     token_hash: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
14:     expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

## DATA-05 — Authentication rate limits allow concurrent requests beyond the configured limit
### backend/app/core/rate_limiter.py:10–22
9:     try:
10:         current = await redis_client.get(key)
11:         if current and int(current) >= limit:
12:             ttl = await redis_client.ttl(key)
13:             raise HTTPException(
14:                 status_code=status.HTTP_429_TOO_MANY_REQUESTS,
15:                 detail="Too many attempts. Please try again later.",
16:                 headers={"Retry-After": str(max(0, ttl))}
17:             )
18: 
19:         pipe = redis_client.pipeline()
20:         pipe.incr(key)
21:         pipe.expire(key, window)
22:         await pipe.execute()
23:     except HTTPException:

## DATA-06 — ARQ uses a different Redis connection contract from the app
### backend/app/core/redis.py:4–7,17–26
3: 
4: redis_client: aioredis.Redis = aioredis.from_url(
5:     settings.REDIS_URL,
6:     decode_responses=True
7: )
8: 
16: 
17: async def get_arq_pool():
18:     global _arq_pool
19:     if _arq_pool is None:
20:         from arq import create_pool
21:         from arq.connections import RedisSettings
22:         redis_settings = RedisSettings(
23:             host=settings.REDIS_HOST,
24:             port=settings.REDIS_PORT
25:         )
26:         _arq_pool = await create_pool(redis_settings)
27:     return _arq_pool

## DATA-07 — A positive score maximum is incorrectly treated as proof that a period was graded
### backend/app/repositories/sqlalchemy/user_repository.py:83–93,134–158,183–208,283–288
82: 
83:         stats_query = select(
84:             func.avg(
85:                 case(
86:                     ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
87:                 )
88:             ),
89:             func.sum(JournalStudentSummary.attendance_count),
90:             func.sum(JournalStudentSummary.total_lessons)
91:         ).filter(JournalStudentSummary.student_id == student_id)
92: 
93:         stats_result = await self.session.execute(stats_query)
94:         avg_score, attendance_count, total_lessons = stats_result.one()
133: 
134:             class_avg_query = select(
135:                 Journal.course_id,
136:                 func.avg(
137:                     case(
138:                         ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
139:                     )
140:                 )
141:             ).join(
142:                 Journal, JournalStudentSummary.journal_id == Journal.id
143:             ).filter(
144:                 Journal.course_id.in_(course_ids)
145:             ).group_by(Journal.course_id)
146:             class_avg_res = await self.session.execute(class_avg_query)
147:             class_avg_map = {cid: round(float(avg_val), 1) for cid, avg_val in class_avg_res.all() if avg_val is not None}
148: 
149:             student_course_query = select(
150:                 Journal.course_id,
151:                 func.avg(
152:                     case(
153:                         ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
154:                     )
155:                 ),
156:                 func.sum(JournalStudentSummary.attendance_count),
157:                 func.sum(JournalStudentSummary.total_lessons),
158:                 func.count(case(((JournalStudentSummary.max_period_score > 0), 1)))
159:             ).join(
182:             rank_map = {}
183:             for cid in course_ids:
184:                 rank_query = select(
185:                     JournalStudentSummary.student_id,
186:                     func.avg(
187:                         case(
188:                             (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
189:                             else_=0.0
190:                         )
191:                     )
192:                 ).join(
193:                     Journal, JournalStudentSummary.journal_id == Journal.id
194:                 ).filter(
195:                     Journal.course_id == cid
196:                 ).group_by(
197:                     JournalStudentSummary.student_id
198:                 ).order_by(
199:                     func.avg(
200:                         case(
201:                             (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
202:                             else_=0.0
203:                         )
204:                     ).desc()
205:                 )
206:                 rank_res = await self.session.execute(rank_query)
207:                 ranked_students = [row[0] for row in rank_res.all()]
208:                 rank_map[cid] = (ranked_students.index(student_id) + 1) if student_id in ranked_students else (len(ranked_students) + 1)
209: 
282:             summary = summaries_map.get(journal.id)
283:             if journal.period_start > today:
284:                 state = "upcoming"
285:             elif summary and summary.max_period_score > 0:
286:                 state = "graded"
287:             else:
288:                 state = "in_progress"
289: 

## DATA-08 — Demo seed leaves the course sequence behind explicit IDs
### backend/scripts/seed_demo_data.py:174,349–362,397
173:         for tbl in TABLES_TO_TRUNCATE:
174:             await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
175:     
348: 
349:             course: Course = Course(
350:                 id=cdef["id"],
351:                 title=cdef["title"],
352:                 description=cdef["description"],
353:                 photo_path=photo_path,
354:                 start_date=cdef["start_date"],
355:                 end_date=cdef["end_date"],
356:                 exam_type=cdef["exam_type"],
357:                 price=cdef["price"],
358:                 mentor_id=cdef["mentor_id"],
359:                 status=CourseStatus.ACTIVE
360:             )
361:             session.add(course)
362:             await session.flush()
363: 
396: 
397:         await session.commit()
398: 

## DATA-09 — Installment identity is not protected by persistence
### backend/app/models/charge.py:24–30,33–35
23:     __tablename__ = "charges"
24:     __table_args__ = (
25:         CheckConstraint("amount > 0", name="check_charge_amount_positive"),
26:         CheckConstraint("sequence_no >= 1", name="check_charge_sequence_positive"),
27:         Index("idx_charges_student_due_date", "student_id", "due_date"),
28:         Index("idx_charges_enrollment", "enrollment_id"),
29:         Index("idx_charges_due_date", "due_date"),
30:     )
31: 
32:     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
33:     enrollment_id: Mapped[int] = mapped_column(ForeignKey("enrollments.id", ondelete="RESTRICT"), nullable=False)
34:     student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
35:     sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
36:     amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

## DATA-10 — Student profile ranking performs one additional database query per course
### backend/app/repositories/sqlalchemy/user_repository.py:182–208
181: 
182:             rank_map = {}
183:             for cid in course_ids:
184:                 rank_query = select(
185:                     JournalStudentSummary.student_id,
186:                     func.avg(
187:                         case(
188:                             (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
189:                             else_=0.0
190:                         )
191:                     )
192:                 ).join(
193:                     Journal, JournalStudentSummary.journal_id == Journal.id
194:                 ).filter(
195:                     Journal.course_id == cid
196:                 ).group_by(
197:                     JournalStudentSummary.student_id
198:                 ).order_by(
199:                     func.avg(
200:                         case(
201:                             (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
202:                             else_=0.0
203:                         )
204:                     ).desc()
205:                 )
206:                 rank_res = await self.session.execute(rank_query)
207:                 ranked_students = [row[0] for row in rank_res.all()]
208:                 rank_map[cid] = (ranked_students.index(student_id) + 1) if student_id in ranked_students else (len(ranked_students) + 1)
209: 

## DATA-11 — Student journal history is unbounded
### backend/app/repositories/sqlalchemy/user_repository.py:242–277
241:         }
242: 
243:     async def get_student_journals(
244:         self,
245:         student_id: int,
246:         course_id: Optional[int] = None
247:     ) -> List[Dict[str, Any]]:
248:         enrollment_query = select(Enrollment.course_id).filter(
249:             Enrollment.student_id == student_id,
250:             Enrollment.is_deleted == False
251:         )
252:         if course_id is not None:
253:             enrollment_query = enrollment_query.filter(Enrollment.course_id == course_id)
254: 
255:         enrollment_res = await self.session.execute(enrollment_query)
256:         enrolled_course_ids = list(enrollment_res.scalars().all())
257:         if not enrolled_course_ids:
258:             return []
259: 
260:         journals_query = select(Journal, Course).join(
261:             Course, Journal.course_id == Course.id
262:         ).filter(
263:             Journal.course_id.in_(enrolled_course_ids)
264:         ).order_by(Journal.period_start.desc())
265: 
266:         journals_res = await self.session.execute(journals_query)
267:         journal_course_pairs = list(journals_res.all())
268:         if not journal_course_pairs:
269:             return []
270: 
271:         journal_ids = [j.id for j, _ in journal_course_pairs]
272:         summaries_query = select(JournalStudentSummary).filter(
273:             JournalStudentSummary.student_id == student_id,
274:             JournalStudentSummary.journal_id.in_(journal_ids)
275:         )
276:         summaries_res = await self.session.execute(summaries_query)
277:         summaries_map = {s.journal_id: s for s in summaries_res.scalars().all()}
278: 

## DATA-12 — Repository protocols omit methods consumers already rely on
### backend/app/repositories/interfaces/base_repository.py:7–29
6: 
7: class BaseRepository(Protocol[T]):
8:     async def get_by_id(self, id: Any, include_deleted: bool = False) -> Optional[T]:
9:         ...
10: 
11:     async def get_list(
12:         self,
13:         skip: int = 0,
14:         limit: int = 100,
15:         include_deleted: bool = False
16:     ) -> List[T]:
17:         ...
18: 
19:     async def create(self, entity: T) -> T:
20:         ...
21: 
22:     async def update(self, entity: T) -> T:
23:         ...
24: 
25:     async def delete(self, id: Any) -> bool:
26:         ...
27: 
28:     async def soft_delete(self, id: Any) -> bool:
29:         ...
### backend/app/repositories/interfaces/user_repository.py:7–31
6: 
7: class UserRepository(BaseRepository[User], Protocol):
8:     async def get_by_email(self, email: str) -> Optional[User]:
9:         ...
10: 
11:     async def get_students_list(
12:         self,
13:         page: int = 1,
14:         page_size: int = 20,
15:         search: Optional[str] = None
16:     ) -> dict:
17:         ...
18: 
19:     async def get_mentors_list(
20:         self,
21:         page: int = 1,
22:         page_size: int = 20,
23:         search: Optional[str] = None
24:     ) -> dict:
25:         ...
26: 
27:     async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
28:         ...
29: 
30:     async def get_mentor_profile_stats(self, mentor_id: int) -> Dict[str, Any]:
31:         ...
### backend/app/repositories/sqlalchemy/base_repository.py:64–99
63: 
64:     async def get_paginated(
65:         self,
66:         base_query: Any,
67:         page: int = 1,
68:         page_size: int = 20
69:     ) -> dict:
70:         from sqlalchemy import func
71:         page_size = min(max(1, page_size), 100)
72:         
73:         count_query = select(func.count()).select_from(base_query.subquery())
74:         total_result = await self.session.execute(count_query)
75:         total = total_result.scalar() or 0
76:         
77:         total_pages = (total + page_size - 1) // page_size if total > 0 else 0
78:         
79:         if page > total_pages and total_pages > 0:
80:             return {
81:                 "items": [],
82:                 "total": total,
83:                 "page": page,
84:                 "page_size": page_size,
85:                 "total_pages": total_pages
86:             }
87:             
88:         offset = (page - 1) * page_size
89:         query = base_query.offset(offset).limit(page_size)
90:         result = await self.session.execute(query)
91:         items = list(result.scalars().all())
92:         
93:         return {
94:             "items": items,
95:             "total": total,
96:             "page": page,
97:             "page_size": page_size,
98:             "total_pages": total_pages
99:         }

## DATA-13 — Integration setup validates ORM metadata instead of the deployable migration chain
### backend/app/tests/conftest.py:59–65
58: 
59: @pytest_asyncio.fixture(scope="session", autouse=True)
60: async def setup_test_db() -> None:
61:     from sqlalchemy import text
62:     async with test_engine.begin() as conn:
63:         await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
64:         await conn.execute(text("CREATE SCHEMA public;"))
65:         await conn.run_sync(Base.metadata.create_all)
66:     yield

## DATA-14 — Optional: Generic pagination lacks stable ordering for user lists
### backend/app/repositories/sqlalchemy/user_repository.py:36–46,55–65
35:     ) -> dict:
36:         query = select(User).filter(User.role == UserRole.STUDENT, User.is_deleted == False)
37:         if search:
38:             search_pattern = f"%{search}%"
39:             query = query.filter(
40:                 or_(
41:                     User.first_name.ilike(search_pattern),
42:                     User.last_name.ilike(search_pattern),
43:                     User.email.ilike(search_pattern),
44:                 )
45:             )
46:         return await self.get_paginated(query, page, page_size)
47: 
54:         query = select(User).filter(User.role == UserRole.MENTOR, User.is_deleted == False)
55:         if search:
56:             search_pattern = f"%{search}%"
57:             query = query.filter(
58:                 or_(
59:                     User.first_name.ilike(search_pattern),
60:                     User.last_name.ilike(search_pattern),
61:                     User.email.ilike(search_pattern),
62:                 )
63:             )
64:         return await self.get_paginated(query, page, page_size)
65: 
66:     async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
### backend/app/repositories/sqlalchemy/base_repository.py:88–91
87:             
88:         offset = (page - 1) * page_size
89:         query = base_query.offset(offset).limit(page_size)
90:         result = await self.session.execute(query)
91:         items = list(result.scalars().all())
92:         

## DATA-15 — Optional: Async infrastructure lifecycle and budgets should be explicit
### backend/app/core/redis.py:14–26,37–41
13: 
14: _arq_pool = None
15: 
16: 
17: async def get_arq_pool():
18:     global _arq_pool
19:     if _arq_pool is None:
20:         from arq import create_pool
21:         from arq.connections import RedisSettings
22:         redis_settings = RedisSettings(
23:             host=settings.REDIS_HOST,
24:             port=settings.REDIS_PORT
25:         )
26:         _arq_pool = await create_pool(redis_settings)
27:     return _arq_pool
36: 
37: async def close_arq_pool() -> None:
38:     global _arq_pool
39:     if _arq_pool is not None:
40:         await _arq_pool.close()
41:         _arq_pool = None
42: 
### backend/app/db/session.py:9–18
8: 
9: engine = create_async_engine(
10:     settings.DATABASE_URL,
11:     future=True,
12:     echo=False,
13:     pool_size=20,
14:     max_overflow=10,
15:     pool_timeout=30,
16:     pool_recycle=1800,
17:     pool_pre_ping=True,
18: )
19: 

## DATA-16 — Nit: Remove an accidental module annotation
### backend/app/models/course_mentor_history.py:23
22:     mentor: Mapped["User"] = relationship("User")
23: Length: 792

## PERF-API-01 — Medium — Measured student chart processing grows quadratically in periods
### backend/app/api/v1/courses.py:194-218,237-259
193: 
194:     journals = await get_course_journals(id, db)
195:     journal_ids = [j.id for j in journals]
196: 
197:     enroll_stmt = (
198:         select(Enrollment)
199:         .options(joinedload(Enrollment.student))
200:         .filter(
201:             Enrollment.course_id == id,
202:             Enrollment.status == EnrollmentStatus.ACTIVE,
203:             Enrollment.is_deleted == False
204:         )
205:     )
206:     enroll_res = await db.execute(enroll_stmt)
207:     enrollments = list(enroll_res.scalars().all())
208:     class_size = len(enrollments)
209: 
210:     summaries = []
211:     if journal_ids:
212:         summary_stmt = select(JournalStudentSummary).filter(
213:             JournalStudentSummary.journal_id.in_(journal_ids)
214:         )
215:         summary_res = await db.execute(summary_stmt)
216:         summaries = list(summary_res.scalars().all())
217: 
218:     summary_map = {(s.student_id, s.journal_id): (s.sum_score, s.max_period_score) for s in summaries}
219: 
236: 
237:         class_avg_series = []
238:         graded_class_avgs = []
239:         for j in journals:
240:             j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
241:             if j_summaries:
242:                 j_pcts = [score_percentage(s.sum_score, s.max_period_score) for s in j_summaries]
243:                 period_avg = round(sum(j_pcts) / len(j_pcts), 1)
244:                 class_avg_series.append(period_avg)
245:                 graded_class_avgs.append(period_avg)
246:             else:
247:                 class_avg_series.append(0.0)
248:         overall_class_avg = round(sum(graded_class_avgs) / len(graded_class_avgs), 1) if graded_class_avgs else 0.0
249:         class_avg_series.append(overall_class_avg)
250: 
251:         student_avgs = {}
252:         for enroll in enrollments:
253:             s_id = enroll.student.id
254:             s_pcts = []
255:             for j in journals:
256:                 sum_score, max_score = summary_map.get((s_id, j.id), (0, 0))
257:                 if max_score > 0:
258:                     s_pcts.append(score_percentage(sum_score, max_score))
259:             student_avgs[s_id] = sum(s_pcts) / len(s_pcts) if s_pcts else 0.0
260: 

## PERF-API-02 — Medium — One unique autosave cell can amplify into thousands of output entries
### backend/app/api/v1/journals.py:32-40
31: 
32: @router.put("/{id}/entries", response_model=JournalBatchUpdateResponse, status_code=status.HTTP_200_OK)
33: async def batch_update_entries(
34:     id: int,
35:     payload: List[JournalEntryUpdate],
36:     current_user: User = Depends(get_current_user),
37:     db: AsyncSession = Depends(get_db_session)
38: ) -> dict:
39:     journal_service = JournalService(db)
40:     return await journal_service.batch_update_entries(id, payload, current_user)
41: 
### backend/app/schemas/journal.py:47-54
46: 
47: class JournalEntryUpdate(BaseModel):
48:     model_config = {"extra": "forbid"}
49:     student_id: int
50:     lesson_date: date
51:     attendance: bool
52:     score: int = Field(ge=0, le=5)
53:     comment: Optional[str] = None
54:     version: int
55: 

## PERF-API-03 — Medium — Successful logins bypass the only route work budget
### backend/app/api/v1/auth.py:22-32
21: 
22: @router.post("/login", response_model=TokenPair)
23: async def login(
24:     payload: LoginRequest,
25:     db: AsyncSession = Depends(get_db_session)
26: ) -> TokenPair:
27:     key = f"auth:attempts:login:{payload.email}"
28:     await check_rate_limit(key, 5, 900)
29:     auth_service = AuthService(db)
30:     result = await auth_service.login(payload.email, payload.password)
31:     await clear_rate_limit(key)
32:     return result
33: 

## PERF-BUS-01 — SMTP without a socket deadline retains request transactions and executor threads
### backend/app/services/email_service.py:24-34
23: 
24:         with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
25:             server.ehlo()
26:             server.starttls()
27:             server.ehlo()
28:             server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
29:             server.send_message(message)
30: 
31:     async def send_email(self, to_email: str, subject: str, body: str) -> None:
32:         if settings.TESTING:
33:             return
34:         await asyncio.to_thread(self._send_smtp, to_email, subject, body)
35: 
### backend/app/services/auth_service.py:111-121,169-177,219-232
110: 
111:     async def generate_verification_code(self, email: str) -> str:
112:         code = str(secrets.randbelow(900000) + 100000)
113:         key = f"auth:code:{email}"
114:         data = {"code": code, "attempts": 0}
115:         await redis_client.set(key, json.dumps(data), ex=600)
116:         await self.email_service.send_email(
117:             to_email=email,
118:             subject="Verification Code",
119:             body=f"Your verification code is: {code}"
120:         )
121:         return code
122: 
168:                 status_code=status.HTTP_404_NOT_FOUND,
169:                 detail="User not found"
170:             )
171: 
172:         if not user.must_set_password:
173:             raise HTTPException(
174:                 status_code=status.HTTP_400_BAD_REQUEST,
175:                 detail="Password already set"
176:             )
177: 
178:         await self.generate_verification_code(email)
218: 
219:     async def password_reset_request(self, email: str) -> None:
220:         user = await self.user_repo.get_by_email(email)
221:         if not user or user.is_deleted:
222:             return
223: 
224:         code = str(secrets.randbelow(900000) + 100000)
225:         key = f"auth:reset:{email}"
226:         data = {"code": code, "attempts": 0}
227:         await redis_client.set(key, json.dumps(data), ex=600)
228:         await self.email_service.send_email(
229:             to_email=email,
230:             subject="Password Reset Code",
231:             body=f"Your password reset code is: {code}"
232:         )
233: 
### backend/app/services/user_service.py:41-44,64-67
40:         )
41:         created_user = await self.user_repo.create(user)
42: 
43:         auth_service = AuthService(self.db)
44:         await auth_service.generate_verification_code(user.email)
45: 
63:             user.email = user_update.email
64:             user.must_set_password = True
65:             auth_service = AuthService(self.db)
66:             await auth_service.generate_verification_code(user.email)
67: 
68:         if user_update.first_name is not None:

## PERF-BUS-02 — Analytics cache expiry multiplies thirteen-query recomputations
### backend/app/services/finance_service.py:1223-1349,1351-1448,1174-1220
1222: 
1223:     async def get_analytics(self, date_from: date, date_to: date) -> dict:
1224:         cache_key = f"finance:analytics:{date_from.isoformat()}:{date_to.isoformat()}"
1225:         cached = await redis_client.get(cache_key)
1226:         if cached:
1227:             return json.loads(cached)
1228: 
1229:         today = get_dushanbe_today()
1230:         active_enrollment = and_(
1231:             Enrollment.status == EnrollmentStatus.ACTIVE,
1232:             Enrollment.is_deleted == False,  # noqa: E712
1233:         )
1234:         billed_to_date_clause = and_(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED)
1235: 
1236:         gross_res = await self.db.execute(
1237:             select(func.coalesce(func.sum(Charge.amount), ZERO))
1238:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1239:             .filter(active_enrollment, Charge.is_deleted == False, Charge.status != ChargeStatus.CANCELLED)  # noqa: E712
1240:         )
1241:         gross_contract_value = Decimal(gross_res.scalar() or 0)
1242: 
1243:         billed_res = await self.db.execute(
1244:             select(func.coalesce(func.sum(Charge.amount), ZERO))
1245:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1246:             .filter(active_enrollment, Charge.is_deleted == False, billed_to_date_clause)  # noqa: E712
1247:         )
1248:         billed_to_date = Decimal(billed_res.scalar() or 0)
1249: 
1250:         settled_res = await self.db.execute(
1251:             select(func.coalesce(func.sum(Allocation.amount), ZERO))
1252:             .join(Charge, Charge.id == Allocation.charge_id)
1253:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1254:             .filter(
1255:                 active_enrollment,
1256:                 Charge.is_deleted == False,  # noqa: E712
1257:                 billed_to_date_clause,
1258:                 Allocation.reversed_by_entry_id.is_(None),
1259:             )
1260:         )
1261:         settled_to_date = Decimal(settled_res.scalar() or 0)
1262:         net_receivable = max(ZERO, billed_to_date - settled_to_date)
1263: 
1264:         # Period bounds: local Dushanbe midnight-to-midnight, expressed in UTC.
1265:         dt_from = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc) - DUSHANBE_TZ_OFFSET
1266:         dt_to = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc) - DUSHANBE_TZ_OFFSET
1267: 
1268:         in_period = and_(LedgerEntry.occurred_at >= dt_from, LedgerEntry.occurred_at <= dt_to)
1269:         voided = self._voided_ids_subquery()
1270: 
1271:         collected_res = await self.db.execute(
1272:             select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
1273:                 LedgerEntry.type == LedgerEntryType.PAYMENT,
1274:                 LedgerEntry.id.notin_(voided),
1275:                 in_period,
1276:             )
1277:         )
1278:         payments_collected = Decimal(collected_res.scalar() or 0)
1279: 
1280:         refunds_res = await self.db.execute(
1281:             select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
1282:                 LedgerEntry.type == LedgerEntryType.REFUND,
1283:                 LedgerEntry.is_cash_out.is_(True),
1284:                 in_period,
1285:             )
1286:         )
1287:         refunds_paid_out = Decimal(refunds_res.scalar() or 0)
1288:         collected_in_period = payments_collected - refunds_paid_out
1289: 
1290:         # Like-for-like denominator: what fell due inside the same window.
1291:         billed_in_period_res = await self.db.execute(
1292:             select(func.coalesce(func.sum(Charge.amount), ZERO))
1293:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1294:             .filter(
1295:                 active_enrollment,
1296:                 Charge.is_deleted == False,  # noqa: E712
1297:                 Charge.status != ChargeStatus.CANCELLED,
1298:                 Charge.due_date >= date_from,
1299:                 Charge.due_date <= date_to,
1300:             )
1301:         )
1302:         billed_in_period = Decimal(billed_in_period_res.scalar() or 0)
1303: 
1304:         outstanding_credit = await self._total_outstanding_credit()
1305:         aging = await self._aging_buckets(today)
1306: 
1307:         debt_query, debt_expr = self._debt_query(today, {})
1308:         debt_sub = debt_query.subquery()
1309:         unpaid_res = await self.db.execute(
1310:             select(func.count(func.distinct(debt_sub.c.student_id))).select_from(debt_sub)
1311:         )
1312:         unpaid_students_count = unpaid_res.scalar() or 0
1313: 
1314:         top_debtors = await self.get_debts(filters={}, page=1, page_size=10)
1315:         debtors_preview = [
1316:             {
1317:                 "student_id": item["student"]["id"],
1318:                 "first_name": item["student"]["first_name"],
1319:                 "last_name": item["student"]["last_name"],
1320:                 "email": item["student"]["email"],
1321:                 "debt": float(item["debt"]),
1322:             }
1323:             for item in top_debtors["items"]
1324:         ]
1325: 
1326:         collection_rate = (
1327:             float((collected_in_period / billed_in_period).quantize(Decimal("0.0001")))
1328:             if billed_in_period > 0
1329:             else 0.0
1330:         )
1331: 
1332:         analytics = {
1333:             "gross_contract_value": float(gross_contract_value),
1334:             "billed_to_date": float(billed_to_date),
1335:             "billed_in_period": float(billed_in_period),
1336:             "net_receivable": float(net_receivable),
1337:             "collected_in_period": float(collected_in_period),
1338:             "outstanding_credit": float(outstanding_credit),
1339:             "aging": {
1340:                 "d0_30": float(aging[0]),
1341:                 "d31_60": float(aging[1]),
1342:                 "d61_90": float(aging[2]),
1343:                 "d90_plus": float(aging[3]),
1344:             },
1345:             "unpaid_students_count": int(unpaid_students_count),
1346:             "collection_rate": collection_rate,
1347:             "debtors_preview": debtors_preview,
1348:         }
1349: 
1350:         await redis_client.set(cache_key, json.dumps(analytics), ex=600)
1350:         await redis_client.set(cache_key, json.dumps(analytics), ex=600)
1351:         return analytics
1352: 
1353:     async def _total_outstanding_credit(self) -> Decimal:
1354:         """Sum of every student's wallet, computed in three set-based queries."""
1355:         voided = self._voided_ids_subquery()
1356: 
1357:         credit_res = await self.db.execute(
1358:             select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
1359:             .filter(LedgerEntry.type.in_(CREDIT_TYPES), LedgerEntry.id.notin_(voided))
1360:             .group_by(LedgerEntry.student_id)
1361:         )
1362:         credit = {row[0]: Decimal(row[1] or 0) for row in credit_res.all()}
1363: 
1364:         cash_out_res = await self.db.execute(
1365:             select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
1366:             .filter(LedgerEntry.type == LedgerEntryType.REFUND, LedgerEntry.is_cash_out.is_(True))
1367:             .group_by(LedgerEntry.student_id)
1368:         )
1369:         cash_out = {row[0]: Decimal(row[1] or 0) for row in cash_out_res.all()}
1370: 
1371:         allocated_res = await self.db.execute(
1372:             select(LedgerEntry.student_id, func.coalesce(func.sum(Allocation.amount), ZERO))
1373:             .join(Allocation, Allocation.ledger_entry_id == LedgerEntry.id)
1374:             .filter(
1375:                 LedgerEntry.type.in_(CREDIT_TYPES),
1376:                 LedgerEntry.id.notin_(voided),
1377:                 Allocation.reversed_by_entry_id.is_(None),
1378:             )
1379:             .group_by(LedgerEntry.student_id)
1380:         )
1381:         allocated = {row[0]: Decimal(row[1] or 0) for row in allocated_res.all()}
1382: 
1383:         total = ZERO
1384:         for student_id, amount in credit.items():
1385:             wallet = amount - cash_out.get(student_id, ZERO) - allocated.get(student_id, ZERO)
1386:             if wallet > ZERO:
1387:                 total += wallet
1388:         return total
1389: 
1390:     async def _aging_buckets(self, today: date) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
1391:         """Outstanding balance bucketed by the age of the oldest open charge."""
1392:         alloc_sub = (
1393:             select(
1394:                 Allocation.charge_id.label("charge_id"),
1395:                 func.coalesce(func.sum(Allocation.amount), ZERO).label("allocated"),
1396:             )
1397:             .filter(Allocation.reversed_by_entry_id.is_(None))
1398:             .group_by(Allocation.charge_id)
1399:             .subquery()
1400:         )
1401: 
1402:         res = await self.db.execute(
1403:             select(
1404:                 Charge.due_date,
1405:                 Charge.amount - func.coalesce(alloc_sub.c.allocated, ZERO),
1406:             )
1407:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1408:             .outerjoin(alloc_sub, alloc_sub.c.charge_id == Charge.id)
1409:             .filter(
1410:                 Enrollment.status == EnrollmentStatus.ACTIVE,
1411:                 Enrollment.is_deleted == False,  # noqa: E712
1412:                 Charge.is_deleted == False,  # noqa: E712
1413:                 Charge.status == ChargeStatus.OPEN,
1414:                 Charge.due_date <= today,
1415:             )
1416:         )
1417: 
1418:         buckets = [ZERO, ZERO, ZERO, ZERO]
1419:         for due_date, remaining in res.all():
1420:             remaining = Decimal(remaining or 0)
1421:             if remaining <= ZERO:
1422:                 continue
1423:             overdue = (today - due_date).days
1424:             if overdue <= 30:
1425:                 buckets[0] += remaining
1426:             elif overdue <= 60:
1427:                 buckets[1] += remaining
1428:             elif overdue <= 90:
1429:                 buckets[2] += remaining
1430:             else:
1431:                 buckets[3] += remaining
1432:         return tuple(buckets)  # type: ignore[return-value]
1433: 
1434:     async def list_charges(self, filters: dict, page: int, page_size: int) -> dict:
1435:         alloc_sub = (
1436:             select(
1437:                 Allocation.charge_id.label("charge_id"),
1438:                 func.coalesce(func.sum(Allocation.amount), ZERO).label("allocated"),
1439:             )
1440:             .filter(Allocation.reversed_by_entry_id.is_(None))
1441:             .group_by(Allocation.charge_id)
1442:             .subquery()
1443:         )
1444: 
1445:         query = (
1446:             select(Charge, Course.title, func.coalesce(alloc_sub.c.allocated, ZERO))
1447:             .join(Enrollment, Enrollment.id == Charge.enrollment_id)
1448:             .join(Course, Course.id == Enrollment.course_id)
1449:             .outerjoin(alloc_sub, alloc_sub.c.charge_id == Charge.id)
1173:         overdue_filter = filters.get("overdue_days")
1174:         if overdue_filter is not None:
1175:             query = query.filter(overdue_expr >= overdue_filter)
1176: 
1177:         return query, debt_expr
1178: 
1179:     async def get_debts(self, filters: dict, page: int, page_size: int) -> dict:
1180:         page_size = min(max(1, page_size), 100)
1181:         today = get_dushanbe_today()
1182: 
1183:         query, debt_expr = self._debt_query(today, filters)
1184: 
1185:         count_res = await self.db.execute(select(func.count()).select_from(query.subquery()))
1186:         total = count_res.scalar() or 0
1187: 
1188:         total_pages = (total + page_size - 1) // page_size if total > 0 else 0
1189:         offset = (page - 1) * page_size
1190: 
1191:         res = await self.db.execute(
1192:             query.order_by(debt_expr.desc(), Enrollment.id.asc()).offset(offset).limit(page_size)
1193:         )
1194: 
1195:         items = []
1196:         for enrollment, student, course, billed, allocated, debt, overdue_days in res.all():
1197:             items.append(
1198:                 {
1199:                     "student": {
1200:                         "id": student.id,
1201:                         "first_name": student.first_name,
1202:                         "last_name": student.last_name,
1203:                         "email": student.email,
1204:                         "payment_day_of_month": student.payment_day_of_month,
1205:                     },
1206:                     "course": {"id": course.id, "title": course.title},
1207:                     "price_at_enrollment": enrollment.price_at_enrollment,
1208:                     "billed_to_date": Decimal(billed or 0),
1209:                     "total_paid": Decimal(allocated or 0),
1210:                     "debt": Decimal(debt or 0),
1211:                     "overdue_days": max(0, int(overdue_days or 0)),
1212:                 }
1213:             )
1214: 
1215:         return {
1216:             "items": items,
1217:             "total": total,
1218:             "page": page,
1219:             "page_size": page_size,
1220:             "total_pages": total_pages,
1221:         }

## PERF-BUS-03 — Every financial mutation scans the whole shared Redis keyspace to invalidate analytics
### backend/app/services/finance_service.py:122-134
121: 
122:     async def _invalidate_cache(self) -> None:
123:         """Drop cached analytics. Uses SCAN — KEYS blocks the Redis event loop."""
124:         try:
125:             cursor = 0
126:             while True:
127:                 cursor, keys = await redis_client.scan(cursor=cursor, match="finance:analytics:*", count=100)
128:                 if keys:
129:                     await redis_client.delete(*keys)
130:                 if cursor == 0:
131:                     break
132:         except Exception:
133:             # Cache invalidation must never fail a financial write.
134:             pass
135: 

## PERF-BUS-04 — Each qualifying document upload creates an ARQ pool without closing it
### backend/app/services/document_service.py:97-107
96:             summary = summary_res.scalars().first()
97:             if summary and summary.exam_score > 0:
98:                 from arq import create_pool
99:                 from arq.connections import RedisSettings
100:                 from app.core.config import settings
101:                 if not settings.TESTING:
102:                     try:
103:                         redis_settings = RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
104:                         pool = await create_pool(redis_settings)
105:                         await pool.enqueue_job("send_student_document_notification_task", owner_id, journal_id)
106:                     except Exception:
107:                         pass
108: 

## PERF-BUS-05 — Autosave flushes once per changed cell before its batch flush
### backend/app/services/journal_service.py:433-511,514-516
432: 
433:         for update_item in entries_updates:
434:             entry = entries_map.get((update_item.student_id, update_item.lesson_date))
435:             if not entry:
436:                 conflicts.append({
437:                     "student_id": update_item.student_id,
438:                     "lesson_date": update_item.lesson_date,
439:                     "submitted_version": update_item.version,
440:                     "current": None
441:                 })
442:                 continue
443: 
444:             target_attendance = True if update_item.score > 0 else update_item.attendance
445: 
446:             if (
447:                 entry.attendance == target_attendance
448:                 and entry.score == update_item.score
449:                 and entry.comment == update_item.comment
450:             ):
451:                 updated_student_ids.add(update_item.student_id)
452:                 applied_entries.append(entry)
453:                 continue
454: 
455:             if entry.version != update_item.version:
456:                 conflicts.append({
457:                     "student_id": update_item.student_id,
458:                     "lesson_date": update_item.lesson_date,
459:                     "submitted_version": update_item.version,
460:                     "current": {
461:                         "student_id": entry.student_id,
462:                         "lesson_date": entry.lesson_date,
463:                         "attendance": entry.attendance,
464:                         "score": entry.score,
465:                         "comment": entry.comment,
466:                         "version": entry.version
467:                     }
468:                 })
469:                 continue
470: 
471:             changes = {}
472:             if entry.attendance != target_attendance:
473:                 changes["attendance"] = (entry.attendance, target_attendance)
474:             if entry.score != update_item.score:
475:                 changes["score"] = (entry.score, update_item.score)
476:             if entry.comment != update_item.comment:
477:                 changes["comment"] = (entry.comment, update_item.comment)
478: 
479:             if changes:
480:                 entry.attendance = target_attendance
481:                 entry.score = update_item.score
482:                 entry.comment = update_item.comment
483: 
484:                 await audit_service.log(
485:                     user_id=current_user.id,
486:                     action="update",
487:                     entity_type="journal_entry",
488:                     entity_id=entry.id,
489:                     changes=changes
490:                 )
491: 
492:             updated_student_ids.add(update_item.student_id)
493:             applied_entries.append(entry)
494: 
495:         if conflicts and not applied_entries:
496:             raise HTTPException(
497:                 status_code=status.HTTP_409_CONFLICT,
498:                 detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
499:             )
500: 
501:         try:
502:             await self.db.flush()
503:         except StaleObjectError:
504:             await self.db.rollback()
505:             raise HTTPException(
506:                 status_code=status.HTTP_409_CONFLICT,
507:                 detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
508:             )
509: 
510:         if updated_student_ids:
511:             sum_service = SumCalculationService(self.db)
512:             await sum_service.recalculate_journal(journal_id)
513: 
514:         summaries_query = select(JournalStudentSummary).filter(
515:             JournalStudentSummary.journal_id == journal_id,
516:             JournalStudentSummary.student_id.in_(student_ids)
517:         )
### backend/app/services/audit_service.py:25-37
24:         try:
25:             for field, values in changes.items():
26:                 old_val, new_val = values
27:                 audit_log = AuditLog(
28:                     user_id=user_id,
29:                     action=AuditAction(action),
30:                     entity_type=entity_type,
31:                     entity_id=entity_id,
32:                     field_name=field,
33:                     old_value=str(old_val) if old_val is not None else None,
34:                     new_value=str(new_val) if new_val is not None else None
35:                 )
36:                 self.db.add(audit_log)
37:             await self.db.flush()
38:         except Exception:
### backend/app/services/sum_calculation_service.py:71-118
70:             select(JournalEntry).filter(JournalEntry.journal_id == journal_id)
71:         )
72:         entries = list(entries_result.scalars().all())
73: 
74:         entries_by_student: dict[int, list[JournalEntry]] = {}
75:         for entry in entries:
76:             entries_by_student.setdefault(entry.student_id, []).append(entry)
77: 
78:         summaries_result = await self.db.execute(
79:             select(JournalStudentSummary).filter(JournalStudentSummary.journal_id == journal_id)
80:         )
81:         summaries = list(summaries_result.scalars().all())
82:         summaries_by_student: dict[int, JournalStudentSummary] = {s.student_id: s for s in summaries}
83: 
84:         all_student_ids = set(entries_by_student.keys()) | set(summaries_by_student.keys())
85: 
86:         for student_id in all_student_ids:
87:             student_entries = entries_by_student.get(student_id, [])
88:             homework_score = sum(e.score for e in student_entries)
89:             attendance_count = sum(1 for e in student_entries if e.attendance is True)
90:             attendance_score = attendance_count * ATTENDANCE_POINT_PER_LESSON
91:             total_lessons = len(student_entries)
92: 
93:             summary = summaries_by_student.get(student_id)
94:             if not summary:
95:                 summary = JournalStudentSummary(
96:                     journal_id=journal_id,
97:                     student_id=student_id,
98:                     homework_score=0,
99:                     attendance_score=0,
100:                     exam_score=0,
101:                     bonus_score=0,
102:                     sum_score=0,
103:                     max_period_score=0,
104:                     attendance_count=0,
105:                     total_lessons=0,
106:                     version=1
107:                 )
108:                 self.db.add(summary)
109:                 summaries_by_student[student_id] = summary
110: 
111:             summary.homework_score = homework_score
112:             summary.attendance_score = attendance_score
113:             summary.attendance_count = attendance_count
114:             summary.total_lessons = total_lessons
115:             summary.max_period_score = max_period_score(total_lessons, exam_max_score_val)
116:             summary.sum_score = homework_score + attendance_score + summary.exam_score + summary.bonus_score
117: 
118:         await self.db.flush()

## PERF-BUS-06 — Course copying materializes each student's entire destination lifetime in one transaction
### backend/app/services/course_service.py:234-264
233: 
234:     async def copy_course(self, new_course_data: CourseCreate, source_course_id: int, current_user: User) -> Course:
235:         from app.models.enrollment import Enrollment, EnrollmentStatus
236:         from app.services.enrollment_service import EnrollmentService
237: 
238:         new_course = await self.create_course(new_course_data, current_user)
239: 
240:         enroll_query = select(Enrollment).filter(
241:             Enrollment.course_id == source_course_id,
242:             Enrollment.status == EnrollmentStatus.ACTIVE,
243:             Enrollment.is_deleted == False
244:         )
245:         enroll_res = await self.db.execute(enroll_query)
246:         enrollments = enroll_res.scalars().all()
247: 
248:         enroll_service = EnrollmentService(self.db)
249:         for enrollment in enrollments:
250:             student_user = await self.user_repo.get_by_id(enrollment.student_id)
251:             if not student_user or student_user.is_deleted or student_user.role != UserRole.STUDENT:
252:                 continue
253: 
254:             try:
255:                 await enroll_service.enroll_student(
256:                     student_id=enrollment.student_id,
257:                     course_id=new_course.id,
258:                     current_user=current_user
259:                 )
260:             except HTTPException:
261:                 pass
262: 
263:         await self.db.refresh(new_course)
264:         return new_course
265: 
### backend/app/services/enrollment_service.py:90-139
89:         schedules_query = select(CourseSchedule).filter(CourseSchedule.course_id == course_id)
90:         schedules_result = await self.db.execute(schedules_query)
91:         schedules = list(schedules_result.scalars().all())
92: 
93:         journals_query = select(Journal).filter(Journal.course_id == course_id)
94:         journals_result = await self.db.execute(journals_query)
95:         journals = list(journals_result.scalars().all())
96: 
97:         entries_to_add = []
98:         summaries_to_add = []
99:         for journal in journals:
100:             lesson_dates = get_lesson_dates(journal.period_start, journal.period_end, schedules)
101:             for l_date in lesson_dates:
102:                 entries_to_add.append(JournalEntry(
103:                     journal_id=journal.id,
104:                     student_id=student_id,
105:                     lesson_date=l_date,
106:                     attendance=False,
107:                     score=0,
108:                     comment=None,
109:                     version=1
110:                 ))
111: 
112:             summaries_to_add.append(JournalStudentSummary(
113:                 journal_id=journal.id,
114:                 student_id=student_id,
115:                 homework_score=0,
116:                 attendance_score=0,
117:                 exam_score=0,
118:                 bonus_score=0,
119:                 sum_score=0,
120:                 max_period_score=max_period_score(len(lesson_dates), journal.exam_max_score),
121:                 attendance_count=0,
122:                 total_lessons=len(lesson_dates),
123:                 version=1
124:             ))
125: 
126:         self.db.add_all(entries_to_add)
127:         self.db.add_all(summaries_to_add)
128: 
129:         await self.db.flush()
130: 
131:         # Generate financial charge schedule for enrollment
132:         from app.services.finance_service import FinanceService
133:         finance_service = FinanceService(self.db)
134:         await finance_service.generate_schedule_for_enrollment(enrollment.id)
135: 
136:         await self.db.refresh(enrollment)
137:         return enrollment
138: 
139:     async def withdraw_student(self, enrollment_id: int) -> Enrollment:
140:         enrollment = await self.enrollment_repo.get_by_id(enrollment_id)
### backend/app/services/journal_generation_service.py:17-68
16:         start_date = course.start_date
17:         end_date = course.end_date
18:         exam_max_score = default_exam_max_score(course.exam_type)
19: 
20:         if course.exam_type == CourseExamType.WEEKLY:
21:             curr_start = start_date
22:             week_idx = 1
23:             while curr_start <= end_date:
24:                 curr_end = min(end_date, curr_start + timedelta(days=6))
25:                 journal = Journal(
26:                     course_id=course.id,
27:                     period_label=f"Week {week_idx}",
28:                     period_start=curr_start,
29:                     period_end=curr_end,
30:                     period_type=JournalPeriodType.WEEK,
31:                     exam_max_score=exam_max_score
32:                 )
33:                 self.db.add(journal)
34:                 journals.append(journal)
35:                 curr_start = curr_end + timedelta(days=1)
36:                 week_idx += 1
37:         elif course.exam_type == CourseExamType.MONTHLY:
38:             curr_year = start_date.year
39:             curr_month = start_date.month
40:             month_idx = 1
41:             while True:
42:                 _, last_day = calendar.monthrange(curr_year, curr_month)
43:                 period_start = max(start_date, date(curr_year, curr_month, 1))
44:                 period_end = min(end_date, date(curr_year, curr_month, last_day))
45: 
46:                 journal = Journal(
47:                     course_id=course.id,
48:                     period_label=f"Month {month_idx}",
49:                     period_start=period_start,
50:                     period_end=period_end,
51:                     period_type=JournalPeriodType.MONTH,
52:                     exam_max_score=exam_max_score
53:                 )
54:                 self.db.add(journal)
55:                 journals.append(journal)
56: 
57:                 if period_end >= end_date:
58:                     break
59: 
60:                 if curr_month == 12:
61:                     curr_month = 1
62:                     curr_year += 1
63:                 else:
64:                     curr_month += 1
65:                 month_idx += 1
66: 
67:         await self.db.flush()
68:         return journals
### backend/app/services/finance_service.py:430-478
429:         start_date = course.start_date
430:         end_date = course.end_date
431: 
432:         total_months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month) + 1
433:         total_months = max(1, total_months)
434: 
435:         price = Decimal(enrollment.price_at_enrollment)
436:         base = (price / Decimal(total_months)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
437: 
438:         payment_day = student.payment_day_of_month or min(28, course.start_date.day)
439: 
440:         charges: List[Charge] = []
441:         accumulated = ZERO
442:         year, month = start_date.year, start_date.month
443: 
444:         for index in range(total_months):
445:             sequence_no = index + 1
446:             if sequence_no == total_months:
447:                 amount = price - accumulated
448:             else:
449:                 amount = base
450:                 accumulated += amount
451: 
452:             _, max_days = calendar.monthrange(year, month)
453:             due_date = date(year, month, min(payment_day, max_days))
454:             if sequence_no == 1:
455:                 # A student joining after their payment day owes the first
456:                 # installment on joining, never retroactively.
457:                 due_date = max(due_date, start_date)
458: 
459:             charge = Charge(
460:                 enrollment_id=enrollment.id,
461:                 student_id=student.id,
462:                 sequence_no=sequence_no,
463:                 amount=amount,
464:                 due_date=due_date,
465:                 type=ChargeType.TUITION,
466:                 status=ChargeStatus.OPEN,
467:             )
468:             self.db.add(charge)
469:             charges.append(charge)
470: 
471:             month += 1
472:             if month > 12:
473:                 month = 1
474:                 year += 1
475: 
476:         await self.db.flush()
477:         await self.auto_allocate_student_credit(student.id, prefer_enrollment_id=enrollment.id)
478:         return charges
479: 

## PERF-DATA-01 — Deployment alternatives multiply pool ceilings without an execution-time budget
### backend/app/db/session.py:9–18
8: 
9: engine = create_async_engine(
10:     settings.DATABASE_URL,
11:     future=True,
12:     echo=False,
13:     pool_size=20,
14:     max_overflow=10,
15:     pool_timeout=30,
16:     pool_recycle=1800,
17:     pool_pre_ping=True,
18: )
19: 
### backend/scripts/gcp_deploy.sh:11–16,56–63
10: MEMORY="${MEMORY:-512Mi}"
11: CPU="${CPU:-1}"
12: MIN_INSTANCES="${MIN_INSTANCES:-0}"
13: MAX_INSTANCES="${MAX_INSTANCES:-5}"
14: PORT="${PORT:-8080}"
15: 
16: if ! command -v gcloud &>/dev/null; then
17:     echo "Error: gcloud CLI is not installed or not in PATH."
55: 
56: gcloud run deploy "${SERVICE_NAME}" \
57:     --image "${IMAGE_TAG}" \
58:     --platform managed \
59:     --region "${REGION}" \
60:     --memory "${MEMORY}" \
61:     --cpu "${CPU}" \
62:     --min-instances "${MIN_INSTANCES}" \
63:     --max-instances "${MAX_INSTANCES}" \
64:     --port "${PORT}" \
### .github/workflows/deploy-backend.yml:140–151
139:         with:
140:           service: ${{ env.SERVICE_NAME }}
141:           image: ${{ env.REGION }}-docker.pkg.dev/${{ steps.auth.outputs.project_id }}/${{ env.REPOSITORY }}/app:${{ github.sha }}
142:           region: ${{ env.REGION }}
143:           flags: >-
144:             --memory=512Mi
145:             --cpu=1
146:             --min-instances=0
147:             --max-instances=2
148:             --port=8080
149:             --allow-unauthenticated
150:             --no-cpu-throttling=false
151:             --network=default
152:             --subnet=default
### backend/Dockerfile:41
40: 
41: CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]

## PERF-DATA-02 — A performance migration removes the course-leading enrollment index
### backend/alembic/versions/7d332ad357b9_add_performance_indexes.py:24–34
23:     # ### commands auto generated by Alembic - please adjust! ###
24:     op.drop_index(op.f('ix_courses_mentor_id'), table_name='courses')
25:     op.drop_index(op.f('ix_courses_status_deleted'), table_name='courses')
26:     op.create_index('idx_courses_mentor_active', 'courses', ['mentor_id'], unique=False, postgresql_where=sa.text("status = 'active' AND is_deleted = false"))
27:     op.drop_index(op.f('ix_enrollments_course_student_deleted'), table_name='enrollments')
28:     op.drop_index(op.f('ix_enrollments_student_deleted'), table_name='enrollments')
29:     op.drop_index(op.f('ix_journal_entries_journal_student'), table_name='journal_entries')
30:     op.create_index('idx_journal_entries_student_attendance', 'journal_entries', ['student_id'], unique=False, postgresql_where=sa.text('attendance = false'))
31:     op.drop_index(op.f('ix_journal_student_summary_journal_student'), table_name='journal_student_summaries')
32:     op.drop_index(op.f('ix_notification_logs_idempotency'), table_name='notification_logs')
33:     op.drop_index(op.f('ix_payments_paid_at'), table_name='payments')
34:     op.drop_index(op.f('ix_payments_student_course'), table_name='payments')
35:     # ### end Alembic commands ###
### backend/alembic/versions/a1b2c3d4e5f6_add_performance_indexes.py:37–48
36: 
37:     # Enrollments: enrollment checks, journal views filter by course + student + is_deleted
38:     op.create_index(
39:         'ix_enrollments_course_student_deleted',
40:         'enrollments',
41:         ['course_id', 'student_id', 'is_deleted']
42:     )
43: 
44:     # Enrollments: student profile aggregation filters by student + is_deleted
45:     op.create_index(
46:         'ix_enrollments_student_deleted',
47:         'enrollments',
48:         ['student_id', 'is_deleted']
49:     )
### backend/app/repositories/sqlalchemy/user_repository.py:124–131
123: 
124:             class_size_query = select(
125:                 Enrollment.course_id,
126:                 func.count(func.distinct(Enrollment.student_id))
127:             ).filter(
128:                 Enrollment.course_id.in_(course_ids),
129:                 Enrollment.is_deleted == False
130:             ).group_by(Enrollment.course_id)
131:             class_size_res = await self.session.execute(class_size_query)
132:             class_size_map = dict(class_size_res.all())

## PERF-DATA-03 — Scoring migration rewrites every summary at least twice in one migration transaction
### backend/alembic/versions/d8e9f0a1b2c3_journal_scoring_redesign.py:15–65
14: 
15: def upgrade() -> None:
16:     op.add_column(
17:         'journals',
18:         sa.Column('exam_max_score', sa.Integer(), server_default='70', nullable=False)
19:     )
20:     op.execute("UPDATE journals SET exam_max_score = 60 WHERE period_type = 'month'")
21: 
22:     op.add_column(
23:         'journal_student_summaries',
24:         sa.Column('homework_score', sa.Integer(), server_default='0', nullable=False)
25:     )
26:     op.add_column(
27:         'journal_student_summaries',
28:         sa.Column('attendance_score', sa.Integer(), server_default='0', nullable=False)
29:     )
30:     op.add_column(
31:         'journal_student_summaries',
32:         sa.Column('max_period_score', sa.Integer(), server_default='0', nullable=False)
33:     )
34: 
35:     op.execute("""
36:         UPDATE journal_student_summaries
37:         SET homework_score = sum_score - exam_score - bonus_score,
38:             attendance_score = attendance_count
39:     """)
40: 
41:     op.execute("UPDATE journal_student_summaries SET bonus_score = 20 WHERE bonus_score > 20")
42:     op.execute("""
43:         UPDATE journal_student_summaries s
44:         SET exam_score = j.exam_max_score
45:         FROM journals j
46:         WHERE j.id = s.journal_id AND s.exam_score > j.exam_max_score
47:     """)
48: 
49:     op.execute("""
50:         UPDATE journal_student_summaries s
51:         SET max_period_score = s.total_lessons * 6 + j.exam_max_score,
52:             sum_score = s.homework_score + s.attendance_score + s.exam_score + s.bonus_score
53:         FROM journals j
54:         WHERE j.id = s.journal_id
55:     """)
56: 
57:     op.create_check_constraint(
58:         'check_exam_max_score_range',
59:         'journals',
60:         'exam_max_score >= 0 AND exam_max_score <= 100'
61:     )
62:     op.create_check_constraint(
63:         'check_bonus_score_range',
64:         'journal_student_summaries',
65:         'bonus_score >= 0 AND bonus_score <= 20'
66:     )
### .github/workflows/deploy-backend.yml:124–134
123: 
124:       - name: Run Database Migrations (Pre-deploy)
125:         env:
126:           DATABASE_URL: ${{ secrets.DATABASE_URL }}
127:         run: |
128:           if [ -n "$DATABASE_URL" ]; then
129:             cd backend
130:             python -m pip install alembic asyncpg sqlalchemy psycopg2-binary
131:             alembic upgrade head || echo "Migration warning: ensure database is reachable from CI runner or execute via Cloud Run Job."
132:           else
133: [credential-bearing source line redacted]
134:           fi
135: 
### backend/scripts/gcp_deploy.sh:42–45
41: 
42: echo "[2/3] Running Alembic migrations before deployment..."
43: if [ -f ".env" ]; then
44:     echo "Applying database schema migrations..."
45:     alembic upgrade head || echo "Note: Run migrations directly against your production DB if local network does not have direct access."
46: fi

## PERF-DATA-04 — Every paginated search pays COUNT and OFFSET work, including empty results
### backend/app/repositories/sqlalchemy/base_repository.py:70–91
69:     ) -> dict:
70:         from sqlalchemy import func
71:         page_size = min(max(1, page_size), 100)
72:         
73:         count_query = select(func.count()).select_from(base_query.subquery())
74:         total_result = await self.session.execute(count_query)
75:         total = total_result.scalar() or 0
76:         
77:         total_pages = (total + page_size - 1) // page_size if total > 0 else 0
78:         
79:         if page > total_pages and total_pages > 0:
80:             return {
81:                 "items": [],
82:                 "total": total,
83:                 "page": page,
84:                 "page_size": page_size,
85:                 "total_pages": total_pages
86:             }
87:             
88:         offset = (page - 1) * page_size
89:         query = base_query.offset(offset).limit(page_size)
90:         result = await self.session.execute(query)
91:         items = list(result.scalars().all())
92:         
### backend/app/repositories/sqlalchemy/user_repository.py:36–46,55–65
35:     ) -> dict:
36:         query = select(User).filter(User.role == UserRole.STUDENT, User.is_deleted == False)
37:         if search:
38:             search_pattern = f"%{search}%"
39:             query = query.filter(
40:                 or_(
41:                     User.first_name.ilike(search_pattern),
42:                     User.last_name.ilike(search_pattern),
43:                     User.email.ilike(search_pattern),
44:                 )
45:             )
46:         return await self.get_paginated(query, page, page_size)
47: 
54:         query = select(User).filter(User.role == UserRole.MENTOR, User.is_deleted == False)
55:         if search:
56:             search_pattern = f"%{search}%"
57:             query = query.filter(
58:                 or_(
59:                     User.first_name.ilike(search_pattern),
60:                     User.last_name.ilike(search_pattern),
61:                     User.email.ilike(search_pattern),
62:                 )
63:             )
64:         return await self.get_paginated(query, page, page_size)
65: 
66:     async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:

## PERF-DATA-05 — Refresh rotation continuously enlarges an authentication table without cleanup
### backend/app/models/refresh_token.py:11–20
10: 
11:     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
12:     user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
13:     token_hash: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
14:     expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
15:     revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
16:     created_at: Mapped[datetime] = mapped_column(
17:         DateTime(timezone=True),
18:         server_default=func.now(),
19:         nullable=False
20:     )
21: 
### backend/app/repositories/sqlalchemy/refresh_token_repository.py:15–36
14:     async def revoke_all_for_user(self, user_id: int) -> None:
15:         now = datetime.now(timezone.utc)
16:         statement = (
17:             update(RefreshToken)
18:             .where(
19:                 RefreshToken.user_id == user_id,
20:                 RefreshToken.revoked_at == None,
21:                 RefreshToken.expires_at > now
22:             )
23:             .values(revoked_at=now)
24:         )
25:         await self.session.execute(statement)
26:         await self.session.flush()
27: 
28:     async def get_valid_token(self, token_hash: str) -> Optional[RefreshToken]:
29:         now = datetime.now(timezone.utc)
30:         query = select(RefreshToken).filter(
31:             RefreshToken.token_hash == token_hash,
32:             RefreshToken.revoked_at == None,
33:             RefreshToken.expires_at > now
34:         )
35:         result = await self.session.execute(query)
36:         return result.scalars().first()
### backend/alembic/versions/c592774b16d3_initial_migration.py:100–112
99:     sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
100:     sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
101:     sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
102:     sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
103:     sa.PrimaryKeyConstraint('id')
104:     )
105:     op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=False)
106:     op.create_table('course_mentor_history',
107:     sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
108:     sa.Column('course_id', sa.Integer(), nullable=False),
109:     sa.Column('mentor_id', sa.Integer(), nullable=False),
110:     sa.Column('assigned_from', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
111:     sa.Column('assigned_to', sa.DateTime(timezone=True), nullable=True),
112:     sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
113:     sa.ForeignKeyConstraint(['mentor_id'], ['users.id'], ondelete='CASCADE'),

## SEC-API-01 — High — Self-service replaces the verified guardian delivery destination
### backend/app/schemas/user.py:32-39
31: 
32: class UserSelfUpdate(BaseModel):
33:     model_config = {"extra": "forbid"}
34:     first_name: Optional[str] = Field(None, min_length=1, max_length=100)
35:     last_name: Optional[str] = Field(None, min_length=1, max_length=100)
36:     date_of_birth: Optional[date] = None
37:     phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
38:     parent_telegram_chat_id: Optional[int] = None
39:     parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
40: 
### backend/app/api/v1/users.py:28-35
27: 
28: @router.patch("/me", response_model=UserResponse)
29: async def update_own_profile(
30:     payload: UserSelfUpdate,
31:     current_user: User = Depends(get_current_user),
32:     db: AsyncSession = Depends(get_db_session)
33: ) -> User:
34:     user_service = UserService(db)
35:     return await user_service.update_own_profile(current_user.id, payload)
36: 

## SEC-API-02 — High — A mentor can enumerate every student's and parent's personal data
### backend/app/api/v1/students.py:18-31
17: 
18: @router.get("/", response_model=PaginatedResponse[UserResponse])
19: async def get_students(
20:     search: Optional[str] = None,
21:     pagination: PaginationParams = Depends(),
22:     current_user: User = Depends(get_current_user),
23:     db: AsyncSession = Depends(get_db_session)
24: ) -> dict:
25:     if current_user.role not in [UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.MENTOR]:
26:         raise HTTPException(
27:             status_code=status.HTTP_403_FORBIDDEN,
28:             detail="Not enough permissions"
29:         )
30:     user_service = UserService(db)
31:     return await user_service.get_students(page=pagination.page, page_size=pagination.page_size, search=search)
32: 
### backend/app/schemas/user.py:42-58
41: 
42: class UserResponse(BaseModel):
43:     id: int
44:     email: EmailStr
45:     first_name: str
46:     last_name: str
47:     role: UserRole
48:     date_of_birth: Optional[date] = None
49:     phone: Optional[str] = None
50:     parent_telegram_chat_id: Optional[int] = None
51:     parent_phone: Optional[str] = None
52:     photo_path: Optional[str] = None
53:     thumbnail_path: Optional[str] = None
54:     payment_day_of_month: Optional[int] = None
55:     must_set_password: bool
56:     is_deleted: bool
57:     created_at: datetime
58:     updated_at: datetime
59: 

## SEC-API-03 — Medium — One mentor relationship exposes courses the student cannot otherwise access
### backend/app/api/v1/mentors.py:66-108
65: 
66: @router.get("/{id}/profile", response_model=MentorProfileResponse)
67: async def get_mentor_profile(
68:     id: int,
69:     current_user: User = Depends(get_current_user),
70:     db: AsyncSession = Depends(get_db_session)
71: ) -> dict:
72:     if current_user.role == UserRole.MENTOR and current_user.id != id:
73:         raise HTTPException(
74:             status_code=status.HTTP_403_FORBIDDEN,
75:             detail="Access denied to other mentor profiles"
76:         )
77:     if current_user.role == UserRole.STUDENT:
78:         enroll_query = select(Enrollment).join(Course).filter(
79:             Enrollment.student_id == current_user.id,
80:             Course.mentor_id == id,
81:             Enrollment.is_deleted == False
82:         )
83:         enroll_res = await db.execute(enroll_query)
84:         if not enroll_res.scalars().first():
85:             raise HTTPException(
86:                 status_code=status.HTTP_403_FORBIDDEN,
87:                 detail="Not enrolled in any course with this mentor"
88:             )
89:     elif current_user.role not in [UserRole.SUPERADMIN, UserRole.MENTOR]:
90:         raise HTTPException(
91:             status_code=status.HTTP_403_FORBIDDEN,
92:             detail="Not enough permissions"
93:         )
94: 
95:     user_repo = SQLAlchemyUserRepository(db)
96:     target_user = await user_repo.get_by_id(id)
97:     if not target_user or target_user.role != UserRole.MENTOR:
98:         raise HTTPException(
99:             status_code=status.HTTP_404_NOT_FOUND,
100:             detail="Mentor not found"
101:         )
102: 
103:     stats = await user_repo.get_mentor_profile_stats(id)
104:     return {
105:         "user": target_user,
106:         "active_courses": stats["active_courses"],
107:         "active_students_count": stats["active_students_count"],
108:         "avg_score": stats["avg_score"]
109:     }
### backend/app/schemas/user.py:42-58,120-124
41: 
42: class UserResponse(BaseModel):
43:     id: int
44:     email: EmailStr
45:     first_name: str
46:     last_name: str
47:     role: UserRole
48:     date_of_birth: Optional[date] = None
49:     phone: Optional[str] = None
50:     parent_telegram_chat_id: Optional[int] = None
51:     parent_phone: Optional[str] = None
52:     photo_path: Optional[str] = None
53:     thumbnail_path: Optional[str] = None
54:     payment_day_of_month: Optional[int] = None
55:     must_set_password: bool
56:     is_deleted: bool
57:     created_at: datetime
58:     updated_at: datetime
59: 
119: 
120: class MentorProfileResponse(BaseModel):
121:     user: UserResponse
122:     active_courses: list[CourseResponse]
123:     active_students_count: int
124:     avg_score: float
125: 

## SEC-API-04 — Medium — Autosave accepts unlimited repeated cells and comments
### backend/app/api/v1/journals.py:32-40
31: 
32: @router.put("/{id}/entries", response_model=JournalBatchUpdateResponse, status_code=status.HTTP_200_OK)
33: async def batch_update_entries(
34:     id: int,
35:     payload: List[JournalEntryUpdate],
36:     current_user: User = Depends(get_current_user),
37:     db: AsyncSession = Depends(get_db_session)
38: ) -> dict:
39:     journal_service = JournalService(db)
40:     return await journal_service.batch_update_entries(id, payload, current_user)
41: 
### backend/app/schemas/journal.py:47-54
46: 
47: class JournalEntryUpdate(BaseModel):
48:     model_config = {"extra": "forbid"}
49:     student_id: int
50:     lesson_date: date
51:     attendance: bool
52:     score: int = Field(ge=0, le=5)
53:     comment: Optional[str] = None
54:     version: int
55: 

## SEC-BUS-01 — Cross-user refresh produces a privileged access grant: service-level confirmation of BUS-01
### backend/app/core/security.py:60-72
59: 
60: def create_refresh_token(expires_delta: Optional[timedelta] = None) -> str:
61:     now = datetime.now(timezone.utc)
62:     if expires_delta:
63:         expire = now + expires_delta
64:     else:
65:         expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
66: 
67:     to_encode: Dict[str, Any] = {
68:         "exp": int(expire.timestamp()),
69:         "iat": int(now.timestamp())
70:     }
71: 
72:     return jwt.encode(to_encode, settings.JWT_REFRESH_SECRET_KEY, algorithm="HS256")
### backend/app/services/auth_service.py:41-51,69-101
40:         access_token = create_access_token(user.id, user.role, scope=scope)
41:         refresh_token = create_refresh_token()
42: 
43:         token_hash = hash_token(refresh_token)
44:         expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
45: 
46:         db_token = RefreshToken(
47:             user_id=user.id,
48:             token_hash=token_hash,
49:             expires_at=expires_at
50:         )
51:         await self.token_repo.create(db_token)
52: 
68: 
69:         token_hash = hash_token(refresh_token)
70:         db_token = await self.token_repo.get_valid_token(token_hash)
71:         if not db_token:
72:             raise credentials_exception
73: 
74:         db_token.revoked_at = datetime.now(timezone.utc)
75:         await self.token_repo.update(db_token)
76: 
77:         user = await self.user_repo.get_by_id(db_token.user_id)
78:         if not user or user.is_deleted:
79:             raise credentials_exception
80: 
81:         scope = "must_set_password" if user.must_set_password else None
82:         new_access_token = create_access_token(user.id, user.role, scope=scope)
83:         new_refresh_token = create_refresh_token()
84: 
85:         new_token_hash = hash_token(new_refresh_token)
86:         expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
87: 
88:         new_db_token = RefreshToken(
89:             user_id=user.id,
90:             token_hash=new_token_hash,
91:             expires_at=expires_at
92:         )
93:         await self.token_repo.create(new_db_token)
94: 
95:         return TokenPair(
96:             access_token=new_access_token,
97:             refresh_token=new_refresh_token,
98: [credential-bearing source line redacted]
99:         )
100: 
101:     async def logout(self, refresh_token: str) -> None:
102:         token_hash = hash_token(refresh_token)

## SEC-BUS-02 — SMTP STARTTLS accepts an unauthenticated server certificate
### backend/app/services/email_service.py:24-29
23: 
24:         with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
25:             server.ehlo()
26:             server.starttls()
27:             server.ehlo()
28:             server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
29:             server.send_message(message)
30: 

## SEC-BUS-03 — Password recovery leaves previously stolen access tokens usable
### backend/app/services/auth_service.py:194-198,302-305
193: 
194:         user.password_hash = hash_password(new_password)
195:         user.must_set_password = False
196:         await self.user_repo.update(user)
197: 
198:         await self.revoke_all_user_tokens(user.id)
199: 
301: 
302:         user.password_hash = hash_password(new_password)
303:         await self.user_repo.update(user)
304: 
305:         await self.revoke_all_user_tokens(user.id)
306: 
### backend/app/core/security.py:47-54
46: 
47:     role_str = role.value if hasattr(role, "value") else str(role)
48:     to_encode: Dict[str, Any] = {
49:         "sub": str(user_id),
50:         "role": role_str,
51:         "exp": int(expire.timestamp()),
52:         "iat": int(now.timestamp())
53:     }
54:     if scope:
55:         to_encode["scope"] = scope

## SEC-BUS-04 — Financial posting can cross accounting-period closure without rechecking the policy
### backend/app/services/finance_service.py:83-99,503-526,1597-1627
82: 
83:     async def _check_period_open(self, occurred_at: datetime, what: str = "entry") -> None:
84:         """Reject writes dated into a closed accounting period."""
85:         local_dt = _to_dushanbe(occurred_at)
86:         query = select(AccountingPeriod).filter(
87:             AccountingPeriod.year == local_dt.year,
88:             AccountingPeriod.month == local_dt.month,
89:         )
90:         res = await self.db.execute(query)
91:         period = res.scalars().first()
92:         if period is not None and period.status == AccountingPeriodStatus.CLOSED:
93:             raise HTTPException(
94:                 status_code=status.HTTP_400_BAD_REQUEST,
95:                 detail=(
96:                     f"Accounting period {local_dt.year}-{local_dt.month:02d} is closed; "
97:                     f"cannot record {what}. Post an adjustment in the open period instead."
98:                 ),
99:             )
100: 
502: 
503:         enrollment_res = await self.db.execute(
504:             select(Enrollment).filter(
505:                 Enrollment.student_id == student_id,
506:                 Enrollment.course_id == course_id,
507:                 Enrollment.is_deleted == False,  # noqa: E712
508:             )
509:         )
510:         enrollment = enrollment_res.scalars().first()
511:         if not enrollment:
512:             raise HTTPException(
513:                 status_code=status.HTTP_400_BAD_REQUEST,
514:                 detail="Student is not enrolled in this course",
515:             )
516: 
517:         entry = LedgerEntry(
518:             student_id=student_id,
519:             type=LedgerEntryType.PAYMENT,
520:             amount=amount,
521:             method=method,
522:             occurred_at=paid_at,
523:             recorded_by_id=current_user.id,
524:             comment=comment,
525:         )
526:         self.db.add(entry)
527:         await self.db.flush()
1596: 
1597:     async def close_period(
1598:         self, year: int, month: int, payload: ClosePeriodPayload, current_user: User
1599:     ) -> AccountingPeriod:
1600:         if current_user.role != UserRole.SUPERADMIN:
1601:             raise HTTPException(
1602:                 status_code=status.HTTP_403_FORBIDDEN,
1603:                 detail="Only SuperAdmin can close accounting periods",
1604:             )
1605: 
1606:         res = await self.db.execute(
1607:             select(AccountingPeriod).filter(AccountingPeriod.year == year, AccountingPeriod.month == month)
1608:         )
1609:         period = res.scalars().first()
1610:         if not period:
1611:             period = AccountingPeriod(year=year, month=month)
1612:             self.db.add(period)
1613:             await self.db.flush()
1614: 
1615:         period.status = AccountingPeriodStatus.CLOSED
1616:         period.closed_by_id = current_user.id
1617:         period.closed_at = datetime.now(timezone.utc)
1618:         period.reopen_reason = None
1619:         await self.db.flush()
1620:         await self.db.refresh(period)
1621: 
1622:         await self._log_audit(
1623:             user_id=current_user.id,
1624:             action="close_period",
1625:             entity_type="accounting_period",
1626:             entity_id=period.id,
1627:             changes={"year": year, "month": month, "status": ("open", "closed")},
1628:         )

## SEC-DATA-01 — VM Redis publication allows authentication-state tampering and worker payload injection
### backend/scripts/setup_free_tier_vm.sh:44–53,69
43: 
44: echo "[4/4] Launching Redis 7 container..."
45: $CONTAINER_CLI stop imkon_redis 2>/dev/null || true
46: $CONTAINER_CLI rm imkon_redis 2>/dev/null || true
47: 
48: $CONTAINER_CLI run -d \
49:     --name imkon_redis \
50:     --restart always \
51:     -p "${REDIS_PORT}:6379" \
52:     -v /var/lib/imkon/redis_data:/data \
53:     redis:7-alpine
54: 
68: [credential-bearing source line redacted]
69: echo "REDIS_URL=redis://${PUBLIC_IP}:${REDIS_PORT}/0"
70: echo "======================================================"
### backend/app/core/redis.py:17–26
16: 
17: async def get_arq_pool():
18:     global _arq_pool
19:     if _arq_pool is None:
20:         from arq import create_pool
21:         from arq.connections import RedisSettings
22:         redis_settings = RedisSettings(
23:             host=settings.REDIS_HOST,
24:             port=settings.REDIS_PORT
25:         )
26:         _arq_pool = await create_pool(redis_settings)
27:     return _arq_pool

## SEC-DATA-02 — Local uploads enter container images and remote build artifacts
### backend/Dockerfile:29–35
28: 
29: COPY --chown=appuser:appgroup alembic.ini .
30: COPY --chown=appuser:appgroup alembic/ ./alembic/
31: COPY --chown=appuser:appgroup app/ ./app/
32: COPY --chown=appuser:appgroup scripts/ ./scripts/
33: COPY --chown=appuser:appgroup storage/ ./storage/
34: 
35: RUN mkdir -p /app/storage && chown -R appuser:appgroup /app/storage
36: 
### backend/.dockerignore:1–15
1: .venv
2: __pycache__
3: *.pyc
4: *.pyo
5: *.pyd
6: .pytest_cache
7: .coverage
8: htmlcov
9: .omc
10: .git
11: .gitignore
12: .env
13: .env.*
14: tests
15: *.log
### backend/scripts/gcp_deploy.sh:39–40
38: 
39: echo "[1/3] Building container image via Cloud Build..."
40: gcloud builds submit --tag "${IMAGE_TAG}" .
41: 

## SEC-DATA-03 — Bootstrap and administrator provisioning expose secrets to logs and process arguments
### backend/scripts/setup_free_tier_vm.sh:34–40,65–68
33: 
34: $CONTAINER_CLI run -d \
35:     --name imkon_db \
36:     --restart always \
37:     -p "${POSTGRES_PORT}:5432" \
38:     -e POSTGRES_USER="${POSTGRES_USER}" \
39: [credential-bearing source line redacted]
40:     -e POSTGRES_DB="${POSTGRES_DB}" \
41:     -v /var/lib/imkon/postgres_data:/var/lib/postgresql/data \
64: echo "PostgreSQL User:   ${POSTGRES_USER}"
65: [credential-bearing source line redacted]
66: echo "Redis Port:        ${REDIS_PORT}"
67: echo ""
68: [credential-bearing source line redacted]
69: echo "REDIS_URL=redis://${PUBLIC_IP}:${REDIS_PORT}/0"
### backend/scripts/seed_admin.py:20–22,70–89
19: async def main():
20:     parser = argparse.ArgumentParser(description="Interactive terminal script to seed a superadmin user into the database.")
21:     parser.add_argument("--email", help="Email address of the superadmin.")
22:     parser.add_argument("--password", help="Password of the superadmin (minimum 8 characters).")
23:     parser.add_argument("--first-name", help="First name of the superadmin.")
69:             
70:     # 4. Password
71:     password = args.password
72:     if not password:
73:         if args.non_interactive:
74:             print("Error: --password is required in non-interactive mode.", file=sys.stderr)
75:             sys.exit(1)
76:         else:
77:             while True:
78:                 p1 = getpass("Enter Password: ")
79:                 if not p1:
80:                     print("Password cannot be empty.")
81:                     continue
82:                 if len(p1) < 8:
83:                     print("Password must be at least 8 characters long.")
84:                     continue
85:                 p2 = getpass("Confirm Password: ")
86:                 if p1 != p2:
87:                     print("Passwords do not match. Please try again.")
88:                     continue
89:                 password = p1
90:                 break

## SEC-DATA-04 — Deactivation preserves identifiable user and notification data indefinitely
### backend/app/repositories/sqlalchemy/base_repository.py:52–61
51: 
52:     async def soft_delete(self, id: Any) -> bool:
53:         entity = await self.get_by_id(id)
54:         if not entity:
55:             return False
56:         if hasattr(entity, "is_deleted"):
57:             entity.is_deleted = True
58:             if hasattr(entity, "deleted_at"):
59:                 entity.deleted_at = datetime.now(timezone.utc)
60:             await self.session.flush()
61:             return True
62:         return False
### backend/app/models/user.py:22–38
21:             name="check_payment_day_of_month_range"
22:         ),
23:     )
24: 
25:     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
26:     email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
27:     password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
28:     first_name: Mapped[str] = mapped_column(String(100), nullable=False)
29:     last_name: Mapped[str] = mapped_column(String(100), nullable=False)
30:     role: Mapped[UserRole] = mapped_column(String(20), nullable=False)
31:     date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
32:     phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
33:     parent_telegram_chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
34:     parent_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
35:     photo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
36:     thumbnail_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
37:     payment_day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
38:     must_set_password: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)
### backend/app/models/notification_log.py:24–39
23:     __table_args__ = (
24:         UniqueConstraint("recipient", "type", "related_entity_id", "notification_date", name="uq_notification_log"),
25:     )
26: 
27:     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
28:     user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
29:     recipient: Mapped[str] = mapped_column(String(255), nullable=False)
30:     type: Mapped[NotificationType] = mapped_column(String(50), nullable=False)
31:     related_entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
32:     notification_date: Mapped[date] = mapped_column(Date, nullable=False)
33:     status: Mapped[NotificationStatus] = mapped_column(String(20), nullable=False)
34:     attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
35:     sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
36:     read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
37:     error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
38: 
39:     user: Mapped[Optional[User]] = relationship("User")
### backend/app/models/document.py:15–25
14: class Document(Base, SoftDeleteMixin):
15:     __tablename__ = "documents"
16: 
17:     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
18:     owner_type: Mapped[DocumentOwnerType] = mapped_column(String(20), nullable=False)
19:     owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
20:     journal_id: Mapped[Optional[int]] = mapped_column(ForeignKey("journals.id", ondelete="SET NULL"), nullable=True)
21:     file_path: Mapped[str] = mapped_column(String(255), nullable=False)
22:     file_name: Mapped[str] = mapped_column(String(255), nullable=False)
23:     file_type: Mapped[str] = mapped_column(String(100), nullable=False)
24:     file_size: Mapped[int] = mapped_column(Integer, nullable=False)
25:     uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
26:     uploaded_at: Mapped[datetime] = mapped_column(

## SEC-DATA-05 — Mutable release inputs execute with build or deployment privileges
### backend/requirements.txt:1–18
1: fastapi>=0.110.0
2: uvicorn>=0.28.0
3: sqlalchemy[asyncio]>=2.0.28
4: asyncpg>=0.29.0
5: alembic>=1.13.1
6: pydantic[email]>=2.6.4
7: pydantic-settings>=2.2.1
8: python-jose[cryptography]>=3.3.0
9: passlib[bcrypt]>=1.7.4
10: redis>=5.0.3
11: arq>=0.25.0
12: aiogram>=3.4.1
13: pillow>=10.2.0
14: httpx>=0.27.0
15: pytest>=8.1.1
16: pytest-asyncio>=0.23.5
17: python-multipart>=0.0.9
18: google-cloud-storage>=2.14.0
### backend/Dockerfile:1–15
1: FROM python:3.12-slim AS builder
2: 
3: WORKDIR /app
4: 
5: RUN apt-get update && apt-get install -y --no-install-recommends \
6:     build-essential \
7:     libpq-dev \
8:     && rm -rf /var/lib/apt/lists/*
9: 
10: COPY requirements.txt .
11: 
12: RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
13: 
14: 
15: FROM python:3.12-slim AS runtime
16: 
### .github/workflows/deploy-backend.yml:80–108,124–131
79: 
80:       - name: Authenticate to Google Cloud
81:         id: auth
82:         uses: google-github-actions/auth@v2
83:         with:
84:           credentials_json: ${{ secrets.GCP_SA_KEY }}
85:           workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
86:           service_account: ${{ secrets.GCP_WIF_SERVICE_ACCOUNT }}
87: 
88:       - name: Set up Cloud SDK
89:         uses: google-github-actions/setup-gcloud@v2
90: 
91:       - name: Configure Docker authentication for Artifact Registry
92:         run: |
93:           gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev --quiet
94: 
95:       - name: Ensure Artifact Registry Repository Exists
96:         run: |
97:           gcloud artifacts repositories describe ${{ env.REPOSITORY }} \
98:             --location=${{ env.REGION }} --format='value(name)' 2>/dev/null || \
99:           gcloud artifacts repositories create ${{ env.REPOSITORY }} \
100:             --repository-format=docker \
101:             --location=${{ env.REGION }} \
102:             --description="IMKON CRM Backend Container Repository"
103: 
104:       - name: Set up Docker Buildx
105:         uses: docker/setup-buildx-action@v3
106: 
107:       - name: Build and push container image
108:         uses: docker/build-push-action@v5
109:         with:
123: 
124:       - name: Run Database Migrations (Pre-deploy)
125:         env:
126:           DATABASE_URL: ${{ secrets.DATABASE_URL }}
127:         run: |
128:           if [ -n "$DATABASE_URL" ]; then
129:             cd backend
130:             python -m pip install alembic asyncpg sqlalchemy psycopg2-binary
131:             alembic upgrade head || echo "Migration warning: ensure database is reachable from CI runner or execute via Cloud Run Job."
132:           else
### .github/workflows/deploy-frontend.yml:24–35,95–102
23: 
24:     steps:
25:       - name: Checkout repository
26:         uses: actions/checkout@v4
27: 
28:       - name: Set up Node.js 22
29:         uses: actions/setup-node@v4
30:         with:
31:           node-version: '22'
32:           cache: 'npm'
33:           cache-dependency-path: 'frontend/package-lock.json'
34: 
35:       - name: Install dependencies
36:         run: |
94:           command: pages deploy dist --project-name=${{ env.PROJECT_NAME }} --branch=main --commit-dirty=false
95: 
96:       - name: Deployment Summary
97:         run: |
98:           echo "======================================================"
99:           echo "Frontend deployed successfully to Cloudflare Pages!"
100:           echo "Project:      ${{ env.PROJECT_NAME }}"
101:           echo "Custom URL:   https://imkon-crm.shadowme.pro"
102:           echo "Pages URL:    ${{ steps.pages_deploy.outputs.deployment-url }}"
103:           echo "Alias URL:    ${{ steps.pages_deploy.outputs.pages-deployment-alias-url }}"
### backend/scripts/setup_free_tier_vm.sh:15–18
14: echo "[1/4] Checking and installing container runtime..."
15: if ! command -v docker &>/dev/null && ! command -v podman &>/dev/null; then
16:     echo "Installing Docker..."
17:     curl -fsSL https://get.docker.com | sh
18:     systemctl enable --now docker
19: fi

