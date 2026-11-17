import express from "express";
import { chatWithAssistant, confirmAiBooking } from "../controllers/aiController.js";
import { verifyToken } from "../utils/verifyToken.js";

const router = express.Router();

router.post("/chat", chatWithAssistant);
router.post("/booking/confirm", verifyToken, confirmAiBooking);

export default router;
