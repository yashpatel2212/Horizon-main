import dotenv from "dotenv";
import mongoose from "mongoose";
import Tour from "../models/Tour.js";
import tours from "../data/tours.js";

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing. Add it to backend/.env before seeding tours.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);
  const results = await Promise.all(
    tours.map((tour) => Tour.findOneAndUpdate(
      { title: tour.title },
      { $set: tour },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ))
  );
  console.log(`${results.length} tour packages are ready.`);
} catch (error) {
  console.error("Could not seed tours:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
