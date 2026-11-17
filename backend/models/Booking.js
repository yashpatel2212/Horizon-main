import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: String
    },
    userEmail: {
      type: String,
    },
    tourName:{
         type:String,
         required:true,
    },
    tourId: {
      type: mongoose.Types.ObjectId,
      ref: "Tour",
    },
    fullName: {
      type: String,
      required: true,
    },
    guestSize :{
        type:Number,
        required:true,
    },
    phone:{
        type:Number,
        required:true,
    },
     bookAt:{
        type:Date,
      required:true,
    },
    pricePerPerson: Number,
    serviceFee: Number,
    totalAmount: Number,
    status: {
      type: String,
      enum: ["confirmed"],
      default: "confirmed",
    },
    confirmationId: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Booking", bookingSchema);
