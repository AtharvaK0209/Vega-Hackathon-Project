const mongoose = require("mongoose");

const InvestorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    firmName: {
      type: String,
      required: true,
    },
    preferredIndustries: [String],
    preferredStages: [
      {
        type: String,
        enum: ["Idea", "Pre-Seed", "Seed", "Early", "Growth"],
      },
    ],
    minInvestment: {
      type: Number,
      required: true,
    },
    maxInvestment: {
      type: Number,
      required: true,
    },
    locationPreference: {
      type: String,
    },
    riskTolerance: {
      type: String,
      enum: ["Low", "Medium", "High"],
    },
    activeMentoring: {
      type: Boolean,
      default: false,
    },
    portfolioTags: [String],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Investor", InvestorSchema);
