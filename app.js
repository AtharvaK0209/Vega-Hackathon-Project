if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");

const User = require("./models/User");
const Startup = require("./models/Startup");
const Investor = require("./models/Investor");

// ================= BASIC CONFIG =================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ================= DATABASE =================
mongoose.set("strictQuery", false);
mongoose
  .connect("mongodb://127.0.0.1:27017/nexus")
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

// ================= SESSION =================
app.use(
  session({
    secret: process.env.SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
  }),
);

// ================= PASSPORT =================
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// ================= FLASH & LOCALS =================
app.use(flash());
app.use((req, res, next) => {
  res.locals.currentUser = req.user; // Useful for navbar logic
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

// ================= AUTH MIDDLEWARE =================
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash("error", "You must be signed in first!");
  res.redirect("/login");
}

// Helper function to handle redirection logic based on profile status
function redirectUserBasedOnStatus(user, res) {
  if (!user.hasFilledProfile) {
    // New user: Send to profile creation
    return user.role === "startup"
      ? res.redirect("/startup/profile")
      : res.redirect("/investor/profile");
  } else {
    // Existing user: Send to dashboard/matching
    return user.role === "startup"
      ? res.redirect("/startup/dashboard")
      : res.redirect("/investor/dashboard");
  }
}

// ================= ROUTES =================

app.get("/", (req, res) => {
  res.render("layout/index");
});

// ================= SIGNUP =================
app.get("/signup", (req, res) => {
  res.render("trial/signup");
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const newUser = new User({ username, email, role });
    const registeredUser = await User.register(newUser, password);

    req.login(registeredUser, (err) => {
      if (err) return next(err);
      req.flash("success", "Welcome to Nexus!");
      redirectUserBasedOnStatus(registeredUser, res);
    });
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/signup");
  }
});

// ================= LOGIN =================
app.get("/login", (req, res) => {
  res.render("trial/login");
});

app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, res) => {
    req.flash("success", "Welcome back!");
    redirectUserBasedOnStatus(req.user, res);
  },
);

// ================= STARTUP FLOW =================

app.get("/startup/profile", isLoggedIn, (req, res) => {
  if (req.user.role !== "startup") return res.redirect("/");

  // Prevent re-filling if already done
  if (req.user.hasFilledProfile) return res.redirect("/startup/dashboard");

  res.render("trial/startup_profile");
});

app.post("/startup/profile", isLoggedIn, async (req, res) => {
  if (req.user.role !== "startup") return res.redirect("/");

  try {
    const newStartup = new Startup({
      userId: req.user._id,
      startupName: req.body.startupName,
      industry: req.body.industry,
      stage: req.body.stage,
      fundingRequired: req.body.fundingRequired,
      equityOffered: req.body.equityOffered,
      location: req.body.location,
      revenueStatus: req.body.revenueStatus,
      teamSize: req.body.teamSize,
      pitchDescription: req.body.pitchDescription,
      tags: req.body.tags ? req.body.tags.split(",") : [],
    });

    await newStartup.save();

    // IMPORTANT: Mark profile as filled
    await User.findByIdAndUpdate(req.user._id, { hasFilledProfile: true });

    req.flash("success", "Profile created successfully!");
    res.redirect("/startup/dashboard");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/startup/profile");
  }
});

app.get("/startup/dashboard", isLoggedIn, async (req, res) => {
  if (req.user.role !== "startup") return res.redirect("/");

  const startup = await Startup.findOne({ userId: req.user._id });
  if (!startup) return res.redirect("/startup/profile");

  res.render("trial/startupdashboard", { startup });
});

// ================= INVESTOR FLOW =================

app.get("/investor/profile", isLoggedIn, (req, res) => {
  if (req.user.role !== "investor") return res.redirect("/");
  if (req.user.hasFilledProfile) return res.redirect("/investor/dashboard");

  res.render("trial/investor_profile");
});

app.post("/investor/profile", isLoggedIn, async (req, res) => {
  try {
    const {
      investorName,
      organization,
      investorEmail,
      locationPreference,
      minInvestment,
      maxInvestment,
      preferredStage,
      investmentType,
      sectors, // The array of checkboxes
      additionalNotes,
    } = req.body;

    const newInvestor = new Investor({
      userId: req.user._id,
      investorName,
      firmName: organization,
      email: investorEmail,
      locationPreference,
      minInvestment: Number(minInvestment),
      maxInvestment: Number(maxInvestment),
      preferredStage,
      investmentType,
      preferredIndustries: sectors || [],
      bio: additionalNotes,
    });

    await newInvestor.save();

    // Mark user as having completed the profile
    await User.findByIdAndUpdate(req.user._id, { hasFilledProfile: true });

    req.flash("success", "Investor profile completed!");
    res.redirect("/investor/dashboard");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/investor/profile");
  }
});

app.get("/investor/dashboard", isLoggedIn, async (req, res) => {
  if (req.user.role !== "investor") return res.redirect("/");

  const investor = await Investor.findOne({ userId: req.user._id });
  if (!investor) return res.redirect("/investor/profile");

  res.render("trial/investordashboard", { investor });
});

// ================= MATCHING =================

app.get("/matches/:startupId", isLoggedIn, async (req, res) => {
  // Only startups should see matches for their startupId
  const startup = await Startup.findById(req.params.startupId);
  if (!startup || !startup.userId.equals(req.user._id)) {
    req.flash("error", "Unauthorized access.");
    return res.redirect("/");
  }

  const investors = await Investor.find();
  const matches = investors.map((inv) => {
    let score = 0;
    if (startup.industry === inv.preferredIndustry) score += 50;
    if (startup.stage === inv.preferredStage) score += 25;
    if (startup.fundingRequired <= inv.maxInvestment) score += 25;
    return { investor: inv, score };
  });

  matches.sort((a, b) => b.score - a.score);
  res.render("trial/match", { startup, matches });
});

// ================= LOGOUT =================
app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);
    req.flash("success", "Goodbye!");
    res.redirect("/login");
  });
});

app.listen(8080, () => {
  console.log("Server is Listening on port 8080");
});
