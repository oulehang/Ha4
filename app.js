const supabaseUrl = "https://zyfftclxllvzmybltlvh.supabase.co";
const supabaseKey = "sb_publishable_a72Gllm99-xJgw2Q9TgCWg_XnbG-blN";
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

const legacyStorageKey = "job-workbench-v1";
const migrationFlagKey = "job-workbench-supabase-migrated";
const state = {
  resumes: [],
  jobs: [],
  questions: []
};
const stages = ["待沟通", "已沟通", "约面试", "已结束"];

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return [...document.querySelectorAll(selector)];
}

function setSyncStatus(message, isError = false) {
  const status = $("#syncStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function mapResume(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    highlights: row.highlights
  };
}

function mapJob(row) {
  return {
    id: row.id,
    company: row.company,
    position: row.position,
    stage: row.stage,
    date: row.follow_up_date,
    note: row.note
  };
}

function mapQuestion(row) {
  return {
    id: row.id,
    topic: row.topic,
    tag: row.tag,
    level: row.level,
    answer: row.answer
  };
}

function readLegacyState() {
  try {
    return JSON.parse(localStorage.getItem(legacyStorageKey)) || {};
  } catch {
    return {};
  }
}

function handleDbError(error, fallbackMessage) {
  if (!error) return;
  setSyncStatus(`${fallbackMessage}: ${error.message}`, true);
  throw error;
}

async function loadData() {
  setSyncStatus("正在从 Supabase 加载数据...");
  const [resumes, jobs, questions] = await Promise.all([
    db.from("job_resumes").select("*").order("created_at", { ascending: true }),
    db.from("boss_jobs").select("*").order("created_at", { ascending: true }),
    db.from("interview_questions").select("*").order("created_at", { ascending: true })
  ]);

  handleDbError(resumes.error, "简历加载失败");
  handleDbError(jobs.error, "岗位加载失败");
  handleDbError(questions.error, "面试题加载失败");

  state.resumes = resumes.data.map(mapResume);
  state.jobs = jobs.data.map(mapJob);
  state.questions = questions.data.map(mapQuestion);

  await migrateLegacyDataIfNeeded();
  renderAll();
  setSyncStatus("已连接 Supabase，数据会自动保存到云端。");
}

async function migrateLegacyDataIfNeeded() {
  if (localStorage.getItem(migrationFlagKey)) return;
  const legacy = readLegacyState();
  const hasLegacy = legacy.resumes?.length || legacy.jobs?.length || legacy.questions?.length;
  const hasRemote = state.resumes.length || state.jobs.length || state.questions.length;
  if (!hasLegacy || hasRemote) {
    localStorage.setItem(migrationFlagKey, "true");
    return;
  }

  setSyncStatus("正在迁移本地历史数据到 Supabase...");
  if (legacy.resumes?.length) {
    const { data, error } = await db
      .from("job_resumes")
      .insert(legacy.resumes.map(({ name, role, status, highlights }) => ({ name, role, status, highlights })))
      .select("*");
    handleDbError(error, "简历迁移失败");
    state.resumes = data.map(mapResume);
  }

  if (legacy.jobs?.length) {
    const { data, error } = await db
      .from("boss_jobs")
      .insert(
        legacy.jobs.map(({ company, position, stage, date, note }) => ({
          company,
          position,
          stage,
          follow_up_date: date,
          note
        }))
      )
      .select("*");
    handleDbError(error, "岗位迁移失败");
    state.jobs = data.map(mapJob);
  }

  if (legacy.questions?.length) {
    const { data, error } = await db
      .from("interview_questions")
      .insert(legacy.questions.map(({ topic, tag, level, answer }) => ({ topic, tag, level, answer })))
      .select("*");
    handleDbError(error, "面试题迁移失败");
    state.questions = data.map(mapQuestion);
  }

  localStorage.setItem(migrationFlagKey, "true");
}

function setView(viewId) {
  $all(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  $all(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderStats() {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const interviews = state.jobs.filter((job) => {
    const date = new Date(job.date);
    return job.stage === "约面试" && date >= now && date <= weekEnd;
  }).length;

  $("#resumeCount").textContent = state.resumes.length;
  $("#jobCount").textContent = state.jobs.filter((job) => job.stage !== "已结束").length;
  $("#questionCount").textContent = state.questions.filter((question) => question.level !== "已掌握").length;
  $("#interviewCount").textContent = interviews;
  $("#todayPlan").textContent = state.jobs.some((job) => job.stage === "待沟通")
    ? "优先处理待沟通岗位，再复盘 2 道高频题"
    : "补充岗位清单，并更新主推简历";
}

function renderOverview() {
  const urgent = state.jobs
    .filter((job) => job.stage !== "已结束")
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  $("#urgentJobs").innerHTML = urgent.length
    ? urgent
        .map(
          (job) => `
          <article class="item">
            <strong>${escapeHtml(job.company)} · ${escapeHtml(job.position)}</strong>
            <span class="meta">${escapeHtml(job.stage)} · ${escapeHtml(job.date)}</span>
          </article>`
        )
        .join("")
    : `<div class="empty">还没有需要跟进的岗位。</div>`;

  const recent = state.questions.slice(-4).reverse();
  $("#recentQuestions").innerHTML = recent.length
    ? recent
        .map(
          (question) => `
          <article class="item">
            <strong>${escapeHtml(question.topic)}</strong>
            <span class="meta">${escapeHtml(question.tag)} · ${escapeHtml(question.level)}</span>
          </article>`
        )
        .join("")
    : `<div class="empty">记录第一道面试题后会显示在这里。</div>`;
}

function renderResumes() {
  $("#resumeRows").innerHTML = state.resumes.length
    ? state.resumes
        .map(
          (resume) => `
          <tr>
            <td><strong>${escapeHtml(resume.name)}</strong></td>
            <td>${escapeHtml(resume.role)}</td>
            <td><span class="tag">${escapeHtml(resume.status)}</span></td>
            <td>${escapeHtml(resume.highlights)}</td>
            <td><button class="delete" data-delete-resume="${resume.id}" aria-label="删除简历版本">×</button></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5"><div class="empty">暂无简历版本，先保存一个主推版本。</div></td></tr>`;
}

function renderJobs() {
  const filter = $("#jobFilter").value;
  const jobs = filter === "全部" ? state.jobs : state.jobs.filter((job) => job.stage === filter);

  $("#jobCards").innerHTML = stages
    .map((stage) => {
      const laneJobs = jobs.filter((job) => job.stage === stage);
      return `
        <section class="lane">
          <h4>${stage} (${laneJobs.length})</h4>
          ${
            laneJobs.length
              ? laneJobs
                  .map(
                    (job) => `
                    <article class="job-card">
                      <span class="tag ${stage === "约面试" ? "hot" : stage === "待沟通" ? "warn" : ""}">${escapeHtml(stage)}</span>
                      <h3>${escapeHtml(job.company)}</h3>
                      <strong>${escapeHtml(job.position)}</strong>
                      <p>${escapeHtml(job.note)}</p>
                      <p class="meta">${escapeHtml(job.date)}</p>
                      <button class="delete" data-delete-job="${job.id}" aria-label="删除岗位">×</button>
                    </article>`
                  )
                  .join("")
              : `<div class="empty">暂无</div>`
          }
        </section>`;
    })
    .join("");
}

function renderQuestions() {
  const keyword = $("#questionSearch").value.trim().toLowerCase();
  const questions = state.questions.filter((question) =>
    `${question.topic} ${question.tag} ${question.answer}`.toLowerCase().includes(keyword)
  );

  $("#questionList").innerHTML = questions.length
    ? questions
        .slice()
        .reverse()
        .map(
          (question) => `
          <article class="question-card">
            <header>
              <div>
                <h3>${escapeHtml(question.topic)}</h3>
                <span class="meta">${escapeHtml(question.tag)}</span>
              </div>
              <span class="tag ${question.level === "高频重点" ? "hot" : question.level === "待复盘" ? "warn" : ""}">
                ${escapeHtml(question.level)}
              </span>
            </header>
            <p>${escapeHtml(question.answer)}</p>
            <button class="delete" data-delete-question="${question.id}" aria-label="删除面试题">×</button>
          </article>`
        )
        .join("")
    : `<div class="empty">没有匹配的面试题。</div>`;
}

function renderAll() {
  renderStats();
  renderOverview();
  renderResumes();
  renderJobs();
  renderQuestions();
}

async function seedDemoData() {
  setSyncStatus("正在写入示例数据...");
  const today = new Date().toISOString().slice(0, 10);
  const interviewDay = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  const [resumes, jobs, questions] = await Promise.all([
    db
      .from("job_resumes")
      .insert([
        {
          name: "Java 后端-支付系统版",
          role: "Java 后端开发工程师",
          status: "主推版本",
          highlights: "突出高并发支付链路、Redis 缓存、MQ 解耦和线上问题排查。"
        },
        {
          name: "数据平台-ETL 版",
          role: "数据开发工程师",
          status: "准备中",
          highlights: "强调调度、数据质量、血缘追踪和稳定性治理。"
        }
      ])
      .select("*"),
    db
      .from("boss_jobs")
      .insert([
        {
          company: "星河科技",
          position: "Java 中级开发",
          stage: "待沟通",
          follow_up_date: today,
          note: "JD 关注 Spring Cloud、MySQL 优化、分布式事务。"
        },
        {
          company: "云启数据",
          position: "数据平台工程师",
          stage: "约面试",
          follow_up_date: interviewDay,
          note: "准备项目架构图和数据质量治理案例。"
        }
      ])
      .select("*"),
    db
      .from("interview_questions")
      .insert([
        {
          topic: "Redis 缓存击穿、穿透、雪崩分别怎么处理？",
          tag: "Redis",
          level: "高频重点",
          answer: "击穿用互斥锁或逻辑过期，穿透用布隆过滤器和空值缓存，雪崩用过期时间打散与多级缓存。"
        },
        {
          topic: "一次线上慢 SQL 排查过程怎么讲？",
          tag: "项目复盘",
          level: "待复盘",
          answer: "按现象、定位、执行计划、索引调整、验证指标、复盘预防的结构回答。"
        }
      ])
      .select("*")
  ]);

  handleDbError(resumes.error, "示例简历写入失败");
  handleDbError(jobs.error, "示例岗位写入失败");
  handleDbError(questions.error, "示例题目写入失败");

  state.resumes.push(...resumes.data.map(mapResume));
  state.jobs.push(...jobs.data.map(mapJob));
  state.questions.push(...questions.data.map(mapQuestion));
  renderAll();
  setSyncStatus("示例数据已保存到 Supabase。");
}

$all(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
$all("[data-jump]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.jump)));

$("#resumeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setSyncStatus("正在保存简历...");
  const payload = formData(event.currentTarget);
  const { data, error } = await db.from("job_resumes").insert(payload).select("*").single();
  handleDbError(error, "简历保存失败");
  state.resumes.push(mapResume(data));
  event.currentTarget.reset();
  renderAll();
  setSyncStatus("简历已保存到 Supabase。");
});

$("#jobForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setSyncStatus("正在保存岗位...");
  const payload = formData(event.currentTarget);
  const { data, error } = await db
    .from("boss_jobs")
    .insert({
      company: payload.company,
      position: payload.position,
      stage: payload.stage,
      follow_up_date: payload.date,
      note: payload.note
    })
    .select("*")
    .single();
  handleDbError(error, "岗位保存失败");
  state.jobs.push(mapJob(data));
  event.currentTarget.reset();
  renderAll();
  setSyncStatus("岗位已保存到 Supabase。");
});

$("#questionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setSyncStatus("正在保存面试题...");
  const payload = formData(event.currentTarget);
  const { data, error } = await db.from("interview_questions").insert(payload).select("*").single();
  handleDbError(error, "面试题保存失败");
  state.questions.push(mapQuestion(data));
  event.currentTarget.reset();
  renderAll();
  setSyncStatus("面试题已保存到 Supabase。");
});

$("#jobFilter").addEventListener("change", renderJobs);
$("#questionSearch").addEventListener("input", renderQuestions);
$("#seedDemo").addEventListener("click", seedDemoData);
$("#makeScript").addEventListener("click", () => {
  const keywords = $("#scriptInput").value.trim() || "岗位核心技能";
  $("#scriptOutput").textContent = `您好，我关注到这个岗位重点需要 ${keywords}。我最近的项目经历和这些方向比较匹配，尤其在业务落地、问题排查和性能优化上有完整经验。方便的话，我想进一步了解团队当前最看重的能力和面试安排。`;
});

document.addEventListener("click", async (event) => {
  const resumeId = event.target.dataset.deleteResume;
  const jobId = event.target.dataset.deleteJob;
  const questionId = event.target.dataset.deleteQuestion;

  if (resumeId) {
    setSyncStatus("正在删除简历...");
    const { error } = await db.from("job_resumes").delete().eq("id", resumeId);
    handleDbError(error, "简历删除失败");
    state.resumes = state.resumes.filter((item) => item.id !== resumeId);
  }

  if (jobId) {
    setSyncStatus("正在删除岗位...");
    const { error } = await db.from("boss_jobs").delete().eq("id", jobId);
    handleDbError(error, "岗位删除失败");
    state.jobs = state.jobs.filter((item) => item.id !== jobId);
  }

  if (questionId) {
    setSyncStatus("正在删除面试题...");
    const { error } = await db.from("interview_questions").delete().eq("id", questionId);
    handleDbError(error, "面试题删除失败");
    state.questions = state.questions.filter((item) => item.id !== questionId);
  }

  if (resumeId || jobId || questionId) {
    renderAll();
    setSyncStatus("删除已同步到 Supabase。");
  }
});

loadData().catch((error) => {
  console.error(error);
  renderAll();
});
