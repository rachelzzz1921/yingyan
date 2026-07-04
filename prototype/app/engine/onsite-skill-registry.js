'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../onsite-skills');

function firstMatch(md, re, fallback = '') {
  const m = String(md || '').match(re);
  return m ? m[1].trim() : fallback;
}

function parseList(md, title) {
  const re = new RegExp(`## ${title}\\n([\\s\\S]*?)(?:\\n## |$)`);
  const block = firstMatch(md, re, '');
  return block.split('\n').map(s => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
}

function readSkill(dirent) {
  const dir = path.join(SKILLS_DIR, dirent.name);
  const fp = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(fp)) return null;
  const md = fs.readFileSync(fp, 'utf8');
  return {
    id: dirent.name,
    name: firstMatch(md, /^#\s+(.+)$/m, dirent.name),
    service_role: firstMatch(md, /^服务角色:\s*(.+)$/m, ''),
    carrier: firstMatch(md, /^载体:\s*(.+)$/m, ''),
    priority: firstMatch(md, /^优先级:\s*(.+)$/m, ''),
    roles: parseList(md, '角色可见性'),
    inputs: parseList(md, '输入 schema'),
    outputs: parseList(md, '输出 schema'),
    dependencies: parseList(md, '依赖既有资产'),
    degrade_path: parseList(md, 'LLM 降级路径'),
    preview: /预览/.test(md),
    path: dir,
  };
}

function listOnsiteSkills() {
  try {
    return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(readSkill)
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'));
  } catch {
    return [];
  }
}

module.exports = { SKILLS_DIR, listOnsiteSkills };
