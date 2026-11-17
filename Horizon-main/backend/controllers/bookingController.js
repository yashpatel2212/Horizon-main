import Booking from "../models/Booking.js";
import User from "../models/User.js";


export const createBooking= async(req,res) =>{
    const { userId, userEmail, ...bookingDetails } = req.body;
    const account = req.user.email ? null : await User.findById(req.user.id).select("email").lean();
    const verifiedEmail = req.user.email || account?.email;
    if (!verifiedEmail) return res.status(401).json({success:false,message:'Unable to verify the booking account'});
    const newBooking = new Booking({
        ...bookingDetails,
        userId: req.user.id,
        userEmail: verifiedEmail,
    })
    try
    {

        const savedBooking= await newBooking.save();
        res.status(200).json({success:true,message:'Your tour is booked',
         data:savedBooking})


    }catch(err){
        console.log(err);
        res.status(500).json({success:false,message:'internal server error'})
    }
}

//get single booking
export const getBooking = async(req,res) =>{
    const id=req.params.id

    try{
        const book= await Booking.findById(id)
        if (!book || (req.user.role !== "admin" && book.userId !== req.user.id)) {
            return res.status(404).json({success:false,message:'not found'})
        }
        res.status(200).json({success:true,message:'successful',
         data:book});
    } catch(err){
        console.log(err);
        res.status(404).json({success:false,message:'not found'})
    }
    };


    //get all booking
export const getAllBooking = async(req,res) =>{
    
    try{
        const books= await Booking.find();
        res.status(200).json({success:true,message:'successful',
         data:books});
    } catch(err){
        console.log(err);
        res.status(500).json({success:false,message:'internal server error'})
    }
    }
