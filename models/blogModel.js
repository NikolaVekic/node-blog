import mongoose from "mongoose";

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  author: String,
  imagePath: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    // Get Date
    default: () =>
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
  },
});

export const Blog = mongoose.model("Blog", blogSchema);
