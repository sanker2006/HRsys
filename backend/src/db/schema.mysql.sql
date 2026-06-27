CREATE TABLE IF NOT EXISTS department (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    employee_no  VARCHAR(64)  NOT NULL UNIQUE,
    department   VARCHAR(255) NOT NULL,
    position     VARCHAR(255) NOT NULL DEFAULT '',
    level        VARCHAR(32)  NOT NULL,
    phone        VARCHAR(32)  NOT NULL,
    id_card_tail VARCHAR(16)  NOT NULL,
    password     VARCHAR(255) NOT NULL,
    status       VARCHAR(32)  NOT NULL DEFAULT 'active',
    is_admin     TINYINT     NOT NULL DEFAULT 0,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_user_phone_idcard (phone, id_card_tail)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS division_leader_department (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    department    VARCHAR(255) NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_division_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
    UNIQUE KEY idx_division_user_department (user_id, department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS batch (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    period          VARCHAR(64)  NOT NULL DEFAULT '',
    start_time      VARCHAR(64)  NOT NULL,
    end_time        VARCHAR(64)  NOT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'draft',
    peer_cross_dept TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eval_matrix (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    batch_id   INT NOT NULL,
    from_role  VARCHAR(32) NOT NULL,
    to_role    VARCHAR(32) NOT NULL,
    eval_type  VARCHAR(32) NOT NULL,
    enabled    TINYINT     NOT NULL DEFAULT 1,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eval_matrix_batch FOREIGN KEY (batch_id) REFERENCES batch(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS relation (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    batch_id     INT NOT NULL,
    evaluator_id INT NOT NULL,
    target_id    INT NOT NULL,
    role_type    VARCHAR(32) NOT NULL,
    eval_type    VARCHAR(32) NOT NULL,
    status       VARCHAR(32) NOT NULL DEFAULT 'pending',
    is_anonymous TINYINT     NOT NULL DEFAULT 1,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_relation_batch FOREIGN KEY (batch_id) REFERENCES batch(id) ON DELETE CASCADE,
    CONSTRAINT fk_relation_evaluator FOREIGN KEY (evaluator_id) REFERENCES app_user(id) ON DELETE CASCADE,
    CONSTRAINT fk_relation_target FOREIGN KEY (target_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS self_question (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    batch_id    INT NOT NULL,
    user_id     INT NOT NULL,
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
    weight_1    DOUBLE,
    weight_2    DOUBLE,
    weight_3    DOUBLE,
    weight_4    DOUBLE,
    weight_5    DOUBLE,
    weight_6    DOUBLE,
    weight_7    DOUBLE,
    weight_8    DOUBLE,
    weight_9    DOUBLE,
    weight_10   DOUBLE,
    comp_content_1 TEXT,
    comp_content_2 TEXT,
    comp_content_3 TEXT,
    comp_content_4 TEXT,
    comp_content_5 TEXT,
    comp_weight_1  DOUBLE,
    comp_weight_2  DOUBLE,
    comp_weight_3  DOUBLE,
    comp_weight_4  DOUBLE,
    comp_weight_5  DOUBLE,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_self_question_batch FOREIGN KEY (batch_id) REFERENCES batch(id) ON DELETE CASCADE,
    CONSTRAINT fk_self_question_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
    UNIQUE KEY idx_self_question_batch_user_unique (batch_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS answer (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    relation_id  INT NOT NULL,
    question_seq INT NULL,
    score        DOUBLE,
    is_total     TINYINT NOT NULL DEFAULT 0,
    is_draft     TINYINT NOT NULL DEFAULT 1,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_answer_relation FOREIGN KEY (relation_id) REFERENCES relation(id) ON DELETE CASCADE,
    UNIQUE KEY idx_answer_relation_seq (relation_id, question_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NULL,
    action     VARCHAR(255) NOT NULL,
    ip         VARCHAR(64),
    detail     TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS intern_user (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    intern_no    VARCHAR(64)  NOT NULL UNIQUE,
    name         VARCHAR(255) NOT NULL,
    phone        VARCHAR(32)  NOT NULL,
    id_card_tail VARCHAR(16)  NOT NULL,
    department   VARCHAR(255) NOT NULL DEFAULT '',
    position     VARCHAR(255) NOT NULL DEFAULT '',
    mentor       VARCHAR(255) NOT NULL DEFAULT '',
    start_date   VARCHAR(32)  NOT NULL,
    end_date     VARCHAR(32)  NOT NULL,
    status       VARCHAR(32)  NOT NULL DEFAULT 'active',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_intern_phone_tail_unique (phone, id_card_tail)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS intern_attendance_record (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    intern_id     INT NOT NULL,
    punch_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    punch_date    VARCHAR(32) NOT NULL,
    latitude      DOUBLE,
    longitude     DOUBLE,
    accuracy      DOUBLE,
    photo_data    BLOB,
    photo_mime    VARCHAR(128),
    evidence_type VARCHAR(32) NOT NULL,
    source        VARCHAR(32) NOT NULL DEFAULT 'intern',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_intern_record_user FOREIGN KEY (intern_id) REFERENCES intern_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS intern_attendance_adjustment (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    intern_id    INT NOT NULL,
    record_id    INT NULL,
    target_date  VARCHAR(32) NOT NULL,
    action       VARCHAR(32) NOT NULL,
    reason       TEXT NOT NULL,
    admin_id     INT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_intern_adjustment_user FOREIGN KEY (intern_id) REFERENCES intern_user(id) ON DELETE CASCADE,
    CONSTRAINT fk_intern_adjustment_record FOREIGN KEY (record_id) REFERENCES intern_attendance_record(id) ON DELETE SET NULL,
    CONSTRAINT fk_intern_adjustment_admin FOREIGN KEY (admin_id) REFERENCES app_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_relation_batch_evaluator ON relation(batch_id, evaluator_id);
CREATE INDEX idx_relation_batch_evaluator_type ON relation(batch_id, evaluator_id, eval_type);
CREATE INDEX idx_relation_batch_target ON relation(batch_id, target_id);
CREATE INDEX idx_relation_batch_target_type ON relation(batch_id, target_id, eval_type);
CREATE INDEX idx_relation_batch_status ON relation(batch_id, status);
CREATE INDEX idx_relation_batch_type_status ON relation(batch_id, eval_type, status);
CREATE INDEX idx_answer_relation ON answer(relation_id);
CREATE INDEX idx_answer_relation_total ON answer(relation_id, is_total);
CREATE INDEX idx_self_question_batch ON self_question(batch_id);
CREATE INDEX idx_self_question_user ON self_question(user_id);
CREATE INDEX idx_app_user_level_status_department ON app_user(level, status, department);
CREATE INDEX idx_app_user_employee_no ON app_user(employee_no);
CREATE INDEX idx_department_sort_id ON department(sort_order, id);
CREATE INDEX idx_log_user ON log(user_id);
CREATE INDEX idx_log_created ON log(created_at);
CREATE INDEX idx_intern_user_status_department ON intern_user(status, department);
CREATE INDEX idx_intern_user_phone_tail ON intern_user(phone, id_card_tail);
CREATE INDEX idx_intern_attendance_intern_date ON intern_attendance_record(intern_id, punch_date);
CREATE INDEX idx_intern_attendance_date ON intern_attendance_record(punch_date);
CREATE INDEX idx_intern_adjustment_intern_date ON intern_attendance_adjustment(intern_id, target_date);
CREATE INDEX idx_intern_adjustment_record ON intern_attendance_adjustment(record_id);
