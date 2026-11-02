const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// End-to-end through the HTTP routes with two subjects: Teacher grows a
// maths bank from lesson text (LaTeX reply with lone backslashes), builds a
// paper, publishes it, and the Student's landing page shows it under maths
// without disturbing the Sanskrit subject's own "latest" pointer.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subjects-flow-test-'));
const papersDir = path.join(tmpDir, 'papers');
fs.mkdirSync(papersDir);
process.env.PAPERS_DIR = papersDir;
process.env.LATEST_FILE = path.join(papersDir, 'latest.txt');
process.env.DB_FILE = path.join(tmpDir, 'app.db');
process.env.TEACHER_PIN = '4321';

const { writeSubject } = require('./helpers/subjectFixture');
writeSubject(tmpDir, 'sanskrit', '## विभागः 2 — test (Test)\n\nQ010: प्रश्नः?\nविकल्पाः: क, ख\nAnswer: क\nStatus: Confirmed\n', {
  nameEn: 'Sanskrit',
});
process.env.SUBJECTS_DIR = writeSubject(
  tmpDir,
  'math',
  '## Lesson 1 — Fraction of a Whole Number\n\nExample 1: What is $\\frac{2}{3}$ of 6? Solution: $\\frac{2}{3} \\times 6 = 4$.\n',
  { name: 'Maths', nameEn: 'Maths', idPrefix: 'GM', latex: true }
);

const app = require('../app');

let server;
let base;
let cookie = '';

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function post(url, fields) {
  return fetch(base + url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(fields).toString(),
  });
}

function get(url) {
  return fetch(base + url, { redirect: 'manual', headers: { cookie } });
}

test('teacher logs in and the dashboard offers both subjects', async () => {
  const login = await post('/admin', { pin: '4321' });
  cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const html = await (await get('/admin/dashboard')).text();
  assert.match(html, /\/admin\/s\/sanskrit\/bank/);
  assert.match(html, /\/admin\/s\/math\/bank/);
});

test('unknown subject is a 404 and the old /admin/bank URL redirects to the default subject', async () => {
  assert.equal((await get('/admin/s/history/bank')).status, 404);
  const old = await get('/admin/bank');
  assert.equal(old.status, 302);
  assert.equal(old.headers.get('location'), '/admin/s/sanskrit/bank');
});

test('maths bank: prompt carries the lesson, a lone-backslash LaTeX reply is approved with a GM id', async () => {
  const list = await (await get('/admin/s/math/bank')).text();
  assert.match(list, /Lesson 1 — Fraction of a Whole Number/);

  await post('/admin/s/math/bank/1/start', { count: '1' });
  const section = await (await get('/admin/s/math/bank/1')).text();
  assert.match(section, /Section: Lesson 1/);
  assert.match(section, /frac\{2\}\{3\}/); // lesson text is in the prompt
  assert.match(section, /every backslash must be doubled/);

  const reply = '```json\n[{"stem": "What is $\\frac{3}{4}$ of 8?", "options": ["$6$", "$5$", "$4$", "$3$"], "answer": "$6$", "note": "$\\frac{3}{4} \\times 8 = 6$"}]\n```';
  await post('/admin/s/math/bank/1/parse', { pasted: reply });
  const reviewHtml = await (await get('/admin/s/math/bank/1')).text();
  assert.match(reviewHtml, /name="approve_0"/);
  assert.doesNotMatch(reviewHtml, /parse-errors/);

  await post('/admin/s/math/bank/1/approve', {
    approve_0: '1',
    stem_0: 'What is $\\frac{3}{4}$ of 8?',
    option_0_0: '$6$',
    option_0_1: '$5$',
    option_0_2: '$4$',
    option_0_3: '$3$',
    answer_0: '$6$',
    note_0: '',
  });

  const stored = JSON.parse(fs.readFileSync(path.join(tmpDir, 'subjects', 'math', 'genai-approved', 'vibhaga-01.json'), 'utf8'));
  assert.equal(stored[0].id, 'GM01-001');
  assert.equal(stored[0].sourceSection, 'Lesson 1');
  assert.equal(stored[0].stem, 'What is $\\frac{3}{4}$ of 8?');
  // Sanskrit's pool is untouched.
  assert.ok(!fs.existsSync(path.join(tmpDir, 'subjects', 'sanskrit', 'genai-approved', 'vibhaga-01.json')));
});

test('compose, publish, and the Student sees maths separately from Sanskrit', async () => {
  const sections = await post('/admin/s/math/builder/sections', { select_1: 'on', count_1: '1' });
  assert.equal(sections.headers.get('location'), '/admin/s/math/builder/time');
  const composed = await post('/admin/s/math/builder/time', { minutes: '15' });
  const previewUrl = composed.headers.get('location');
  assert.match(previewUrl, /^\/admin\/preview\//);
  const paperId = previewUrl.split('/').pop();

  const paperText = fs.readFileSync(path.join(papersDir, paperId + '.md'), 'utf8');
  assert.match(paperText, /^Subject: math$/m);
  assert.match(paperText, /^Sections: Lesson 1$/m);

  const preview = await (await get(previewUrl)).text();
  assert.match(preview, /What is \$\\frac\{3\}\{4\}\$ of 8\?/);

  await post('/admin/make-latest/' + paperId, {});
  assert.equal(fs.readFileSync(path.join(papersDir, 'latest-math.txt'), 'utf8').trim(), paperId);
  assert.ok(!fs.existsSync(path.join(papersDir, 'latest.txt')), "Sanskrit's pointer must not be touched");

  const landing = await (await fetch(base + '/')).text();
  assert.match(landing, new RegExp(`/test/${paperId}`));
  assert.match(landing, /Maths/);
  assert.match(landing, /Sanskrit/);

  const test1 = await fetch(`${base}/test/${paperId}`, { redirect: 'follow' });
  assert.equal(test1.status, 200);
  const testHtml = await test1.text();
  assert.match(testHtml, /katex/);
  assert.match(testHtml, /Question 1 \/ 1/);
  assert.match(testHtml, /Submit/);
  assert.doesNotMatch(testHtml, /[\u0900-\u097F]/, 'a non-Sanskrit test page must contain no Devanagari');
  assert.doesNotMatch(preview, /[\u0900-\u097F]/);

  // Landing: the maths block is English-only; Sanskrit's block keeps its Devanagari labels.
  const mathBlock = landing.split('<section class="subject-block">')[2];
  assert.match(mathBlock, /Take Test/);
  assert.doesNotMatch(mathBlock, /[\u0900-\u097F]/);
});
