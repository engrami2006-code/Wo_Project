# WO — Water Optimization

**إدارة ذكية لمياه الزراعة.** WO نظام دعم قرار ذكي قائم على المعرفة (Knowledge-Based DSS). يساعد المزارع والشركات الزراعية في:

- تحديد كمية الري.
- متابعة أنظمة الزراعة المائية.
- تسجيل استهلاك المياه وتحليله.
- توزيع الأرض على المحاصيل حسب الماء المتاح.

كل توصية يقدمها النظام تأتي مع شرح كامل لسببها.

> مشروع مادة **مقدمة في الذكاء الاصطناعي** (كتاب Russell & Norvig).
> لا يستخدم **تعلم الآلة** ولا **الذكاء الاصطناعي التوليدي**. الذكاء فيه وكيل معرفي مبني على المنطق القضوي والاستدلال والبحث وحل مسائل القيود.

## التشغيل في VS Code (5 خطوات)

**المتطلبات:** Python 3.11 أو أحدث، و Node.js 20 أو أحدث، و PostgreSQL 16. إذا لم يتوفر لديك PostgreSQL فاستخدم Docker أو خيار SQLite.

1. افتح مجلد `WO-Water-Optimization` في VS Code، ووافق على تثبيت الإضافات المقترحة.
2. أنشئ قاعدة البيانات في PostgreSQL:
   ```sql
   CREATE USER wo WITH PASSWORD 'wo_dev_password' CREATEDB;
   CREATE DATABASE wo OWNER wo;
   ```
   إذا لم يكن لديك PostgreSQL، أضف الخيار `-Sqlite` أو `--sqlite` في الخطوة التالية. هذا الخيار للتطوير فقط.
3. شغّل الإعداد مرة واحدة. السكربت ينشئ البيئة الافتراضية، ويثبت الحزم، ويولد `JWT_SECRET`، وينفذ الـ migrations، ويثبت حزم الواجهة:
   - **ويندوز:** `powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1`
   - **ماك / لينكس:** `./scripts/setup.sh`
4. اختر مفسر بايثون: `Ctrl+Shift+P` ثم *Python: Select Interpreter* ثم `backend/.venv`.
5. شغّل النظام من **Run and Debug ← "Full stack (API + web)"**، أو بالأمر `.\scripts\dev.ps1`.
   - الواجهة: http://localhost:5173
   - توثيق الـ API: http://localhost:8000/api/docs

**أول حساب** تنشئه من صفحة التسجيل. اختر نوع الحساب «شركة» لتحصل على صلاحية مالك الشركة.

**إضافات اختيارية:**
- **مشرف عام:** نفّذ `python -m app.scripts.create_superadmin --email you@example.com` من داخل `backend`.
- **بيانات عرض للتقديم:** نفّذ `python -m app.scripts.demo_seed`. تُنشأ كلها تحت مزرعة واحدة عليها شارة **DEMO**، والقيم فيها توضيحية. الدخول بالحساب `demo@wo-demo.com` وكلمة المرور `DemoPass12345`. لحذفها أضف `--remove` إلى الأمر.

**بديل بدون تثبيت أي شيء (Docker):**
```bash
cp .env.example .env   # ضع JWT_SECRET و POSTGRES_PASSWORD
docker compose up --build
```
ثم افتح http://localhost:8080

## أين أجد كل متطلب من المادة؟
| المفهوم | مكانه في النظام |
|---|---|
| الوكيل المعرفي TELL/ASK | `backend/app/ai/agent.py` |
| المنطق القضوي، CNF، TT-ENTAILS، DPLL، Resolution | `backend/app/ai/logic/` وصفحة Logic Lab |
| Forward Chaining وحل التعارض | `backend/app/ai/inference/forward.py` و `conflict.py` |
| Backward Chaining واكتشاف البيانات الناقصة | `backend/app/ai/inference/backward.py` والشات بوت |
| التحقق من قاعدة المعرفة بفحص النماذج | `backend/app/ai/knowledge_base/validation.py` |
| تحويل الأرقام إلى حقائق (Perception) | `backend/app/ai/perception/` |
| شرح التوصيات | `backend/app/ai/explanations/builder.py` |
| البحث BFS / UCS / Greedy / A* | `backend/app/optimization/land_distribution/` |
| حل مسائل القيود CSP: AC-3 و MRV و LCV و Forward Checking | `backend/app/optimization/scheduling/csp.py` |

الجدول الكامل في [`docs/traceability.md`](docs/traceability.md).

## المجلدات
- `backend`: الـ API والذكاء الاصطناعي والاختبارات (86 اختبارًا).
- `frontend`: الواجهة بالعربي والإنجليزي، مع دعم كامل للاتجاه من اليمين لليسار.
- `docs`: التوثيق، و 11 مخطط UML، ولقطات الشاشة.
- `presentation`: عرض تقديمي من 16 شريحة (HTML و PDF).
- `prompt`: البرومبت المعاد بناؤه، والبرومبت الأصلي، وتحليله.

## سياسة البيانات
- **المعرفة المرجعية** موثقة المصدر، وتُحمّل مع الـ migration. تشمل القواعد ومعاملات FAO-56 وكفاءات طرق الري.
- **البيانات التشغيلية** تبدأ فارغة: المستخدمون والمزارع والسجلات والطقس والتوصيات.
- لا توجد أي بيانات وهمية تُنشأ تلقائيًا.
- لا يدّعي النظام أي نسبة توفير في المياه ما لم يُسجَّل خط أساس مقاس فعليًا.
