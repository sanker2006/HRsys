import Router from '@koa/router';
import authRoutes from './auth.js';
import userRoutes from './user.js';
import batchRoutes from './batch.js';
import evalMatrixRoutes from './eval_matrix.js';
import relationRoutes from './relation.js';
import selfQuestionRoutes from './self_question.js';
import answerRoutes from './answer.js';
import departmentRoutes from './department.js';

const router = new Router();
router.use(authRoutes.routes(), authRoutes.allowedMethods());
router.use(userRoutes.routes(), userRoutes.allowedMethods());
router.use(batchRoutes.routes(), batchRoutes.allowedMethods());
router.use(evalMatrixRoutes.routes(), evalMatrixRoutes.allowedMethods());
router.use(relationRoutes.routes(), relationRoutes.allowedMethods());
router.use(selfQuestionRoutes.routes(), selfQuestionRoutes.allowedMethods());
router.use(answerRoutes.routes(), answerRoutes.allowedMethods());
router.use(departmentRoutes.routes(), departmentRoutes.allowedMethods());

export default router;
