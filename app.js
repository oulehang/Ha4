const storageKey = "job-workbench-v1";
const defaultState = {
  resumes: [],
  jobs: [],
  questions: []
};

const state = loadState();
const stages = ["待沟通", "已沟通", "约面试", "已结束"];

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(storageKey)) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return [...document.querySelectorAll(selector)];
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

function seedDemoData() {
  state.resumes = [
    {
      id: uid(),
      name: "Java 后端-支付系统版",
      role: "Java 后端开发工程师",
      status: "主推版本",
      highlights: "突出高并发支付链路、Redis 缓存、MQ 解耦和线上问题排查。"
    },
    {
      id: uid(),
      name: "数据平台-ETL 版",
      role: "数据开发工程师",
      status: "准备中",
      highlights: "强调调度、数据质量、血缘追踪和稳定性治理。"
    }
  ];
  state.jobs = [
    {
      id: uid(),
      company: "星河科技",
      position: "Java 中级开发",
      stage: "待沟通",
      date: new Date().toISOString().slice(0, 10),
      note: "JD 关注 Spring Cloud、MySQL 优化、分布式事务。"
    },
    {
      id: uid(),
      company: "云启数据",
      position: "数据平台工程师",
      stage: "约面试",
      date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      note: "准备项目架构图和数据质量治理案例。"
    }
  ];
  state.questions = [
    {
      id: uid(),
      topic: "Redis 缓存击穿、穿透、雪崩分别怎么处理？",
      tag: "Redis",
      level: "高频重点",
      answer: "击穿用互斥锁或逻辑过期，穿透用布隆过滤器和空值缓存，雪崩用过期时间打散与多级缓存。"
    },
    {
      id: uid(),
      topic: "一次线上慢 SQL 排查过程怎么讲？",
      tag: "项目复盘",
      level: "待复盘",
      answer: "按现象、定位、执行计划、索引调整、验证指标、复盘预防的结构回答。"
    }
  ];
  saveState();
  renderAll();
}

$all(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
$all("[data-jump]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.jump)));

$("#resumeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.resumes.push({ id: uid(), ...formData(event.currentTarget) });
  event.currentTarget.reset();
  saveState();
  renderAll();
});

$("#jobForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.jobs.push({ id: uid(), ...formData(event.currentTarget) });
  event.currentTarget.reset();
  saveState();
  renderAll();
});

$("#questionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.questions.push({ id: uid(), ...formData(event.currentTarget) });
  event.currentTarget.reset();
  saveState();
  renderAll();
});

$("#jobFilter").addEventListener("change", renderJobs);
$("#questionSearch").addEventListener("input", renderQuestions);
$("#seedDemo").addEventListener("click", seedDemoData);
$("#makeScript").addEventListener("click", () => {
  const keywords = $("#scriptInput").value.trim() || "岗位核心技能";
  $("#scriptOutput").textContent = `您好，我关注到这个岗位重点需要 ${keywords}。我最近的项目经历和这些方向比较匹配，尤其在业务落地、问题排查和性能优化上有完整经验。方便的话，我想进一步了解团队当前最看重的能力和面试安排。`;
});

document.addEventListener("click", (event) => {
  const resumeId = event.target.dataset.deleteResume;
  const jobId = event.target.dataset.deleteJob;
  const questionId = event.target.dataset.deleteQuestion;

  if (resumeId) state.resumes = state.resumes.filter((item) => item.id !== resumeId);
  if (jobId) state.jobs = state.jobs.filter((item) => item.id !== jobId);
  if (questionId) state.questions = state.questions.filter((item) => item.id !== questionId);
  if (resumeId || jobId || questionId) {
    saveState();
    renderAll();
  }
});

renderAll();
