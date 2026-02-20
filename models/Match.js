const mongoose = require("mongoose");

const MatchSchema = new mongoose.Schema(
  {
    startupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Startup",
      required: true,
    },
    investorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Investor",
      required: true,
    },

    matchScore: {
      type: Number,
      required: true,
    },

    structuredScore: {
      type: Number,
    },

    finalScore: {
      type: Number,
    },

    aiAnalysis: {
      summary: String,
      strengths: [String],
      concerns: [String],
    },

    status: {
      type: String,
      enum: ["Recommended", "Requested", "Connected", "Rejected"],
      default: "Recommended",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Match", MatchSchema);
