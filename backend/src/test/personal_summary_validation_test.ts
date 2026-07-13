import assert from 'node:assert/strict';
import { MAX_FILE_SIZE, validateWordFile } from '../route/personal_summary.js';

function expectRejected(name: string, data: Buffer, message: string): void {
  assert.throws(() => validateWordFile(name, data), error => {
    assert(error instanceof Error);
    return error.message === message;
  });
}

const doc = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.from('legacy word content'),
]);
assert.equal(validateWordFile('summary.doc', doc).mimeType, 'application/msword');

const docx = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('[Content_Types].xml word/document.xml'),
]);
assert.equal(
  validateWordFile('summary.docx', docx).mimeType,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
);

expectRejected('summary.pdf', docx, '仅支持 .doc 或 .docx 文件');
expectRejected('fake.docx', Buffer.from('not a zip'), '文件内容不是有效的 Word .docx 文档');
expectRejected('empty.doc', Buffer.alloc(0), '文件不能为空');
expectRejected('large.docx', Buffer.alloc(MAX_FILE_SIZE + 1), '文件不能超过 10 MB');

console.log('personal summary validation tests passed');
