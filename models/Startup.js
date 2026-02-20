const mongoose = require("mongoose");

const StartupSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startupName: {
      type: String,
      required: true,
    },
    industry: {
      type: String,
      required: true,
    },
    stage: {
      type: String,
      enum: ["Idea", "Pre-Seed", "Seed", "Early", "Growth"],
      required: true,
    },
    fundingRequired: {
      type: Number,
      required: true,
    },
    equityOffered: {
      type: Number,
    },
    location: {
      type: String,
      required: true,
    },
    revenueStatus: {
      type: String,
      enum: ["Pre-Revenue", "Revenue Generating", "Profitable"],
    },
    teamSize: {
      type: Number,
    },
    pitchDescription: {
      type: String,
      required: true,
    },
    tags: [String],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Startup", StartupSchema);
