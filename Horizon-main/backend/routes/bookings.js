import express from 'express'
import { createBooking, getAllBooking, getBooking } from '../controllers/bookingController.js'
import { verifyAdmin, verifyToken } from '../utils/verifyToken.js'

const router=express.Router()

router.post("/" ,verifyToken, createBooking);
router.get("/:id" ,verifyToken, getBooking);
router.get("/" ,verifyAdmin, getAllBooking);



export default router
