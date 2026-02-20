const mongoose = require("mongoose");
const passportLocalMongoose=require("passport-local-mongoose");

const UserSchema = new mongoose.Schema(
  {
    
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    
    role: {
      type: String,
      enum: ["startup", "investor", "admin"],
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

UserSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("User", UserSchema);
