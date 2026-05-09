PRAGMA foreign_keys = ON;

-- 0. department 部门表（需先迁移现有数据）
CREATE TABLE IF NOT EXISTS department (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 1. app_user 用户表
CREATE TABLE IF NOT EXISTS app_user (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    employee_no  TEXT    NOT NULL UNIQUE,
    department   TEXT    NOT NULL,
    position     TEXT    NOT NULL DEFAULT '',
    level        TEXT    NOT NULL,
    phone        TEXT    NOT NULL,
    id_card_tail TEXT    NOT NULL,
    password     TEXT    NOT NULL,
    is_admin     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(phone, id_card_tail)
);

CREATE TABLE IF NOT EXISTS division_leader_department (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    department    TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
    UNIQUE(user_id, department)
);

-- 2. batch 批次表
CREATE TABLE IF NOT EXISTS batch (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    period          TEXT    NOT NULL DEFAULT '',
    start_time      TEXT    NOT NULL,
    end_time        TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'draft',
    peer_cross_dept INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 3. eval_matrix 评估矩阵表
CREATE TABLE IF NOT EXISTS eval_matrix (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id   INTEGER NOT NULL,
    from_role  TEXT    NOT NULL,
    to_role    TEXT    NOT NULL,
    eval_type  TEXT    NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (batch_id) REFERENCES batch(id) ON DELETE CASCADE
);

-- 4. relation 评价关系表
CREATE TABLE IF NOT EXISTS relation (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id     INTEGER NOT NULL,
    evaluator_id INTEGER NOT NULL,
    target_id    INTEGER NOT NULL,
    role_type    TEXT    NOT NULL,
    eval_type    TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    is_anonymous INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (batch_id) REFERENCES batch(id) ON DELETE CASCADE,
    FOREIGN KEY (evaluator_id) REFERENCES app_user(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES app_user(id) ON DELETE CASCADE
);

-- 5. self_question 自评题目表（宽表设计）
-- 每人每批次一行，content_1~10 为题目内容，weight_1~10 为百分比权重
-- 权重之和必须 = 1（应用层校验），每题满分 = weight × 100
CREATE TABLE IF NOT EXISTS self_question (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id    INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    content_1   TEXT,
    content_2   TEXT,
    content_3   TEXT,
    content_4   TEXT,
    content_5   TEXT,
    content_6   TEXT,
    content_7   TEXT,
    content_8   TEXT,
    content_9   TEXT,
    content_10  TEXT,
    weight_1    REAL,
    weight_2    REAL,
    weight_3    REAL,
    weight_4    REAL,
    weight_5    REAL,
    weight_6    REAL,
    weight_7    REAL,
    weight_8    REAL,
    weight_9    REAL,
    weight_10   REAL,
    comp_content_1 TEXT,
    comp_content_2 TEXT,
    comp_content_3 TEXT,
    comp_content_4 TEXT,
    comp_content_5 TEXT,
    comp_weight_1  REAL,
    comp_weight_2  REAL,
    comp_weight_3  REAL,
    comp_weight_4  REAL,
    comp_weight_5  REAL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (batch_id) REFERENCES batch(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
    UNIQUE(batch_id, user_id)
);

-- 6. answer 答案表
-- 自评逐题：question_seq=1~10, score=0~满分(weight×100), is_total=0
-- 自评总分：question_seq=NULL, score=各题得分之和(0~100), is_total=1
-- 互评/向下：question_seq=NULL, score=0~100, is_total=1
CREATE TABLE IF NOT EXISTS answer (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    relation_id INTEGER NOT NULL,
    question_seq INTEGER,
    score       REAL,
    is_total    INTEGER NOT NULL DEFAULT 0,
    is_draft    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (relation_id) REFERENCES relation(id) ON DELETE CASCADE,
    UNIQUE(relation_id, question_seq)
);

-- 7. log 操作日志表
CREATE TABLE IF NOT EXISTS log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    action     TEXT    NOT NULL,
    ip         TEXT,
    detail     TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_relation_batch_evaluator ON relation(batch_id, evaluator_id);
CREATE INDEX IF NOT EXISTS idx_relation_batch_target ON relation(batch_id, target_id);
CREATE INDEX IF NOT EXISTS idx_answer_relation ON answer(relation_id);
CREATE INDEX IF NOT EXISTS idx_self_question_batch ON self_question(batch_id);
CREATE INDEX IF NOT EXISTS idx_self_question_user ON self_question(user_id);
CREATE INDEX IF NOT EXISTS idx_log_user ON log(user_id);
CREATE INDEX IF NOT EXISTS idx_log_created ON log(created_at);
