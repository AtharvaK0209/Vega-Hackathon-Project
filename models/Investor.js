const mongoose = require("mongoose");

const InvestorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    investorName: {
      type: String,
      required: true,
    },
    firmName: { // This maps to "Organization / Firm" in your HTML
      type: String,
    },
    email: { // Contact email for the investor/firm
      type: String,
    },
    preferredIndustries: [String], // Maps to the "sectors" checkboxes
    preferredStage: { // Changed from array to String to match your <select>
      type: String,
      enum: ["Idea", "Pre-Seed", "Seed", "Series A", "Growth Stage"],
    },
    investmentType: { // New field from your HTML
      type: String,
      enum: ["Equity", "Debt", "Convertible Note", "Any"],
    },
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
    bio: { // Maps to "Additional Notes" in your HTML
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Investor", InvestorSchema);