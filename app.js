const supabaseUrl = "https://zyfftclxllvzmybltlvh.supabase.co";
const supabaseKey = "sb_publishable_a72Gllm99-xJgw2Q9TgCWg_XnbG-blN";
const db = window.supabase.createClient(supabaseUrl, supabaseKey);
const resumeBucket = "resume-files";

const state = { resumes: [], jobs: [], questions: [] };
const stages = ["待沟通", "已沟通", "约面试", "已结束"];
let activeResumeId = null;

const $ = (selector) => document.querySelector(selector);
const $all = (selector) => [...document.querySelectorAll(selector)];

function setSyncStatus(message, isError = false) {
  const status = $("#syncStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function sanitizePathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

function publicFileUrl(path) {
  if (!path) return "";
  return db.storage.from(resumeBucket).getPublicUrl(path).data.publicUrl;
}

function mapResume(row) {
  const kind = row.resume_kind || (row.storage_path ? "pdf" : row.markdown_content ? "markdown" : "structured");
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    highlights: row.highlights || "",
    kind,
    markdown: row.markdown_content || "",
    fileName: row.file_name || "",
    fileMime: row.file_mime || "",
    storagePath: row.storage_path || "",
    fileSize: row.file_size || 0,
    fileUrl: publicFileUrl(row.storage_path)
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
  renderAll();
  setSyncStatus("已连接 Supabase，数据会自动保存到云端。");
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
          (job) => `<article class="item"><strong>${escapeHtml(job.company)} · ${escapeHtml(job.position)}</strong><span class="meta">${escapeHtml(job.stage)} · ${escapeHtml(job.date)}</span></article>`
        )
        .join("")
    : `<div class="empty">还没有需要跟进的岗位。</div>`;

  const recent = state.questions.slice(-4).reverse();
  $("#recentQuestions").innerHTML = recent.length
    ? recent
        .map(
          (question) => `<article class="item"><strong>${escapeHtml(question.topic)}</strong><span class="meta">${escapeHtml(question.tag)} · ${escapeHtml(question.level)}</span></article>`
        )
        .join("")
    : `<div class="empty">记录第一道面试题后会显示在这里。</div>`;
}

function renderResumes() {
  $("#resumeRows").innerHTML = state.resumes.length
    ? state.resumes
        .map((resume) => {
          const typeText = { structured: "结构化", markdown: "Markdown", pdf: "PDF" }[resume.kind] || "结构化";
          return `
          <tr class="${resume.id === activeResumeId ? "selected-row" : ""}">
            <td><strong>${escapeHtml(resume.name)}</strong><div class="meta">${escapeHtml(resume.fileName)}</div></td>
            <td><span class="tag">${typeText}</span></td>
            <td>${escapeHtml(resume.role)}</td>
            <td><span class="tag">${escapeHtml(resume.status)}</span></td>
            <td>${escapeHtml(resume.highlights)}</td>
            <td class="row-actions">
              <button class="secondary small" data-preview-resume="${resume.id}">预览</button>
              <button class="delete" data-delete-resume="${resume.id}" aria-label="删除简历版本">×</button>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty">暂无简历版本，先保存一个主推版本或上传 Markdown/PDF。</div></td></tr>`;
}

function renderMarkdownPreview(markdown) {
  const html = window.marked ? window.marked.parse(markdown || "") : `<pre>${escapeHtml(markdown)}</pre>`;
  return `<article class="markdown-body">${html}</article>`;
}

function renderResumePreview(id) {
  const resume = state.resumes.find((item) => item.id === id);
  if (!resume) return;
  activeResumeId = id;
  $("#previewTitle").textContent = resume.name;
  $("#markdownEditor").hidden = resume.kind !== "markdown";
  $("#saveMarkdown").hidden = resume.kind !== "markdown";
  $("#exportMarkdownPdf").hidden = resume.kind !== "markdown";

  if (resume.kind === "markdown") {
    $("#markdownEditor").value = resume.markdown;
    $("#resumePreview").classList.remove("empty");
    $("#resumePreview").innerHTML = renderMarkdownPreview(resume.markdown);
  } else if (resume.kind === "pdf") {
    $("#resumePreview").classList.remove("empty");
    $("#resumePreview").innerHTML = `<iframe class="pdf-frame" src="${resume.fileUrl}" title="${escapeHtml(resume.name)}"></iframe>`;
  } else {
    $("#resumePreview").classList.remove("empty");
    $("#resumePreview").innerHTML = `
      <article class="markdown-body">
        <h1>${escapeHtml(resume.name)}</h1>
        <p><strong>目标岗位：</strong>${escapeHtml(resume.role)}</p>
        <p><strong>状态：</strong>${escapeHtml(resume.status)}</p>
        <h2>核心亮点</h2>
        <p>${escapeHtml(resume.highlights)}</p>
      </article>`;
  }
  renderResumes();
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
              <div><h3>${escapeHtml(question.topic)}</h3><span class="meta">${escapeHtml(question.tag)}</span></div>
              <span class="tag ${question.level === "高频重点" ? "hot" : question.level === "待复盘" ? "warn" : ""}">${escapeHtml(question.level)}</span>
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
          highlights: "突出高并发支付链路、Redis 缓存、MQ 解耦和线上问题排查。",
          resume_kind: "structured"
        },
        {
          name: "Markdown 简历模板",
          role: "后端开发工程师",
          status: "准备中",
          highlights: "可在线编辑并导出 PDF。",
          resume_kind: "markdown",
          file_name: "backend-resume.md",
          file_mime: "text/markdown",
          markdown_content: "# 张三\n\n## 目标岗位\n后端开发工程师\n\n## 项目经历\n- 负责支付系统核心链路优化，接口 P95 延迟下降 35%。\n- 使用 Redis、MQ 和 MySQL 完成高并发订单处理。\n\n## 技能\nJava / Spring Boot / MySQL / Redis / Kafka"
        }
      ])
      .select("*"),
    db
      .from("boss_jobs")
      .insert([
        { company: "星河科技", position: "Java 中级开发", stage: "待沟通", follow_up_date: today, note: "JD 关注 Spring Cloud、MySQL 优化、分布式事务。" },
        { company: "云启数据", position: "数据平台工程师", stage: "约面试", follow_up_date: interviewDay, note: "准备项目架构图和数据质量治理案例。" }
      ])
      .select("*"),
    db
      .from("interview_questions")
      .insert([
        { topic: "Redis 缓存击穿、穿透、雪崩分别怎么处理？", tag: "Redis", level: "高频重点", answer: "击穿用互斥锁或逻辑过期，穿透用布隆过滤器和空值缓存，雪崩用过期时间打散与多级缓存。" },
        { topic: "一次线上慢 SQL 排查过程怎么讲？", tag: "项目复盘", level: "待复盘", answer: "按现象、定位、执行计划、索引调整、验证指标、复盘预防的结构回答。" }
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
  const { data, error } = await db
    .from("job_resumes")
    .insert({ ...payload, resume_kind: "structured" })
    .select("*")
    .single();
  handleDbError(error, "简历保存失败");
  state.resumes.push(mapResume(data));
  event.currentTarget.reset();
  renderAll();
  setSyncStatus("简历已保存到 Supabase。");
});

$("#resumeFileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formData(form);
  const file = payload.file;
  const isMarkdown = /\.m(ark)?d$/i.test(file.name) || file.type === "text/markdown";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

  if (!isMarkdown && !isPdf) {
    setSyncStatus("只支持上传 .md、.markdown 或 .pdf 文件。", true);
    return;
  }

  setSyncStatus("正在上传简历文件...");
  let rowPayload = {
    name: payload.name,
    role: payload.role,
    status: payload.status,
    highlights: payload.highlights || "",
    file_name: file.name,
    file_mime: isMarkdown ? "text/markdown" : "application/pdf",
    file_size: file.size,
    resume_kind: isMarkdown ? "markdown" : "pdf"
  };

  if (isMarkdown) {
    rowPayload.markdown_content = await readTextFile(file);
  } else {
    const storagePath = `pdf/${Date.now()}-${sanitizePathPart(file.name)}`;
    const upload = await db.storage.from(resumeBucket).upload(storagePath, file, {
      contentType: "application/pdf",
      upsert: false
    });
    handleDbError(upload.error, "PDF 上传失败");
    rowPayload.storage_path = storagePath;
  }

  const { data, error } = await db.from("job_resumes").insert(rowPayload).select("*").single();
  handleDbError(error, "文件简历保存失败");
  const resume = mapResume(data);
  state.resumes.push(resume);
  form.reset();
  renderAll();
  renderResumePreview(resume.id);
  setSyncStatus("简历文件已保存到 Supabase。");
});

$("#markdownEditor").addEventListener("input", () => {
  const resume = state.resumes.find((item) => item.id === activeResumeId);
  if (!resume || resume.kind !== "markdown") return;
  resume.markdown = $("#markdownEditor").value;
  $("#resumePreview").innerHTML = renderMarkdownPreview(resume.markdown);
});

$("#saveMarkdown").addEventListener("click", async () => {
  const resume = state.resumes.find((item) => item.id === activeResumeId);
  if (!resume || resume.kind !== "markdown") return;
  setSyncStatus("正在保存 Markdown...");
  const { data, error } = await db
    .from("job_resumes")
    .update({ markdown_content: $("#markdownEditor").value })
    .eq("id", resume.id)
    .select("*")
    .single();
  handleDbError(error, "Markdown 保存失败");
  Object.assign(resume, mapResume(data));
  renderResumePreview(resume.id);
  setSyncStatus("Markdown 已保存到 Supabase。");
});

$("#exportMarkdownPdf").addEventListener("click", () => {
  const resume = state.resumes.find((item) => item.id === activeResumeId);
  if (!resume || resume.kind !== "markdown") return;
  const source = document.createElement("div");
  source.className = "markdown-body pdf-export";
  source.innerHTML = window.marked.parse($("#markdownEditor").value || "");
  document.body.appendChild(source);
  window
    .html2pdf()
    .set({
      margin: 12,
      filename: `${sanitizePathPart(resume.name || "resume")}.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    })
    .from(source)
    .save()
    .finally(() => source.remove());
});

$("#jobForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setSyncStatus("正在保存岗位...");
  const payload = formData(event.currentTarget);
  const { data, error } = await db
    .from("boss_jobs")
    .insert({ company: payload.company, position: payload.position, stage: payload.stage, follow_up_date: payload.date, note: payload.note })
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
  const previewId = event.target.dataset.previewResume;
  const resumeId = event.target.dataset.deleteResume;
  const jobId = event.target.dataset.deleteJob;
  const questionId = event.target.dataset.deleteQuestion;

  if (previewId) renderResumePreview(previewId);

  if (resumeId) {
    setSyncStatus("正在删除简历...");
    const resume = state.resumes.find((item) => item.id === resumeId);
    const { error } = await db.from("job_resumes").delete().eq("id", resumeId);
    handleDbError(error, "简历删除失败");
    if (resume?.storagePath) await db.storage.from(resumeBucket).remove([resume.storagePath]);
    state.resumes = state.resumes.filter((item) => item.id !== resumeId);
    if (activeResumeId === resumeId) {
      activeResumeId = null;
      $("#previewTitle").textContent = "选择一份简历预览";
      $("#markdownEditor").hidden = true;
      $("#saveMarkdown").hidden = true;
      $("#exportMarkdownPdf").hidden = true;
      $("#resumePreview").className = "resume-preview empty";
      $("#resumePreview").textContent = "从左侧列表选择简历。Markdown 支持在线编辑和导出 PDF，PDF 支持在线预览。";
    }
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
