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

mongoose.connect("mongodb://127.0.0.1:27017/nexus")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


// ================= SESSION =================

app.use(session({
  secret: process.env.SECRET || "supersecret",
  resave: false,
  saveUninitialized: false,
}));


// ================= PASSPORT =================

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


// ================= FLASH =================

app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});


// ================= AUTH MIDDLEWARE =================

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}


// ================= HOME =================

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
      if (err) return res.redirect("/login");

      req.flash("success", "Account created successfully!");

      if (registeredUser.role === "startup") {
        return res.redirect("/startup/profile");
      }

      return res.redirect("/investor/profile");
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
    failureFlash: "Invalid username or password"
  }),
  (req, res) => {

    req.flash("success", "Welcome back!");

    if (req.user.role === "startup") {
      return res.redirect("/startup/profile");
    }

    return res.redirect("/investor/profile");
  }
);


// ================= LOGOUT =================

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/login");
    });
  });
});


// ================= STARTUP FLOW =================

// Show Startup Profile Form
app.get("/startup/profile", isLoggedIn, (req, res) => {

  if (req.user.role !== "startup") {
    return res.redirect("/");
  }

  res.render("trial/startup_profile");
});


// Save Startup Profile
app.post("/startup/profile", isLoggedIn, async (req, res) => {

  if (req.user.role !== "startup") {
    return res.redirect("/");
  }

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
      tags: req.body.tags ? req.body.tags.split(",") : []
    });

    await newStartup.save();

    req.flash("success", "Profile created successfully!");
    res.redirect("/startup/dashboard");

  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/startup/profile");
  }
});


// Startup Dashboard
app.get("/startup/dashboard", isLoggedIn, async (req, res) => {

  if (req.user.role !== "startup") {
    return res.redirect("/");
  }

  const startup = await Startup.findOne({
    userId: req.user._id
  });

  res.render("trial/startupdashboard", { startup });
});

app.get("/matches/:startupId", isLoggedIn, async (req, res) => {

  if (req.user.role !== "startup") {
    return res.redirect("/");
  }

  const startup = await Startup.findById(req.params.startupId);

  if (!startup) {
    return res.send("Startup not found");
  }

  const investors = await Investor.find();

  const matches = investors.map(inv => {

    let score = 0;

    if (startup.industry === inv.preferredIndustry) score += 50;
    if (startup.stage === inv.preferredStage) score += 25;
    if (startup.fundingRequired <= inv.maxInvestment) score += 25;

    return {
      investor: inv,
      score
    };
  });

  matches.sort((a, b) => b.score - a.score);

  res.render("trial/match", { startup, matches });
});

// ================= INVESTOR FLOW =================

// Show Investor Profile
app.get("/investor/profile", isLoggedIn, (req, res) => {

  if (req.user.role !== "investor") {
    return res.redirect("/");
  }

  res.render("trial/investor_profile");
});


// Save Investor Profile
app.post("/investor/profile", isLoggedIn, async (req, res) => {

  if (req.user.role !== "investor") {
    return res.redirect("/");
  }

  try {
    const newInvestor = new Investor({
      userId: req.user._id,
      preferredIndustry: req.body.preferredIndustry,
      investmentRange: req.body.investmentRange,
      location: req.body.location,
      bio: req.body.bio
    });

    await newInvestor.save();

    req.flash("success", "Profile created successfully!");
    res.redirect("/investor/dashboard");

  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/investor/profile");
  }
});


// Investor Dashboard
app.get("/investor/dashboard", isLoggedIn, async (req, res) => {

  if (req.user.role !== "investor") {
    return res.redirect("/");
  }

  const investor = await Investor.findOne({
    userId: req.user._id
  });

  res.render("trial/investordashboard", { investor });
});


// ================= SERVER =================

app.listen(8080, () => {
  console.log("Server is Listening on port 8080");
});