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
const { GoogleGenerativeAI } = require("@google/generative-ai");

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
});
// ================= LOGOUT =================
app.get("/logout", (req, res, next) => {
    req.logout(function (err) {
        if (err) return next(err);
        req.flash("success", "Goodbye!");
        res.redirect("/login");
    });
});

//--------------------Gemini api logic


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getAIBasedMatches(startup, investors) {
    // 1. Initialize the model correctly
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite",
        // This forces the model to strictly output a JSON object
        generationConfig: { responseMimeType: "application/json" } 
    });

    const prompt = `
    Analyze this Startup: ${JSON.stringify(startup)}
    Against these Investors: ${JSON.stringify(investors)}

    Return a JSON array of objects. Each object must have:
    "investorId" (string from the investor's _id),
    "score" (number 0-100),
    "reasoning" (brief string explaining the match).
    
    Format: [{"investorId": "...", "score": 85, "reasoning": "..."}]
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // No need for regex cleaning if using responseMimeType: "application/json"
        return JSON.parse(text);
    } catch (error) {
        console.error("Internal Gemini Parse Error:", error);
        return []; // Return empty array so the app doesn't crash
    }
}

async function getAIBasedMatchesForInvestor(investor, startups) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        You are a professional Venture Capital analyst. 
        Investor Profile: ${JSON.stringify(investor)}
        Available Startups: ${JSON.stringify(startups)}

        Evaluate how well each startup fits this investor's thesis based on:
        1. Sector Match (Does the startup industry fit investor's preferred industries?)
        2. Investment Size (Does fundingRequired fit within min/max investment range?)
        3. Stage Fit (e.g., Seed, Series A)
        4. Location and synergy.

        Return ONLY a JSON array of objects:
        [
          {
            "startupId": "string",
            "score": number (0-100),
            "reasoning": "A concise explanation of the investment fit"
          }
        ]
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return JSON.parse(response.text());
        
    } catch (error) {
        console.error("Gemini API Error (Investor Side):", error);
        // Fallback: If AI fails, return basic scores
        return startups.map(s => ({
            startupId: s._id.toString(),
            score: 0,
            reasoning: "AI Matcher currently unavailable."
        }));
    }
}

// ================= STARTUP FLOW =================

app.get("/startup/profile", isLoggedIn, (req, res) => {
  if (req.user.role !== "startup") return res.redirect("/");

  // Prevent re-filling if already done
  if (req.user.hasFilledProfile) return res.redirect("/startup/dashboard");

  res.render("trial/startup_profile", { startup: {} });
});

app.get("/startup/profile/edit", isLoggedIn, async (req, res) => {
    if (req.user.role !== "startup") return res.redirect("/");
    
    const startup = await Startup.findOne({ userId: req.user._id });
    if (!startup) return res.redirect("/startup/profile");
    
    res.render("trial/startup_profile", { startup });
});

app.post("/startup/profile", isLoggedIn, async (req, res) => {
  if (req.user.role !== "startup") return res.redirect("/");

  try {
    const startupData = {
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
    };

    // Check if startup profile already exists for this user
    let startup = await Startup.findOne({ userId: req.user._id });

    if (startup) {
        // Update existing profile
        await Startup.findOneAndUpdate({ userId: req.user._id }, startupData);
        req.flash("success", "Profile updated successfully!");
    } else {
        // Create new profile
        startup = new Startup(startupData);
        await startup.save();
        await User.findByIdAndUpdate(req.user._id, { hasFilledProfile: true });
        req.flash("success", "Profile created successfully!");
    }

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

  res.render("trial/investor_profile", { investor: {} });
});

app.get("/investor/profile/edit", isLoggedIn, async (req, res) => {
    if (req.user.role !== "investor") return res.redirect("/");
    
    const investor = await Investor.findOne({ userId: req.user._id });
    if (!investor) return res.redirect("/investor/profile");
    
    res.render("trial/investor_profile", { investor });
});

app.post("/investor/profile", isLoggedIn, async (req, res) => {
  try {
    const investorData = {
      userId: req.user._id,
      investorName: req.body.investorName,
      firmName: req.body.organization,
      email: req.body.investorEmail,
      locationPreference: req.body.locationPreference,
      minInvestment: Number(req.body.minInvestment),
      maxInvestment: Number(req.body.maxInvestment),
      preferredStage: req.body.preferredStage,
      investmentType: req.body.investmentType,
      preferredIndustries: req.body.sectors || [],
      bio: req.body.additionalNotes,
    };

    // Check if investor profile already exists
    let investor = await Investor.findOne({ userId: req.user._id });

    if (investor) {
        // Update
        await Investor.findOneAndUpdate({ userId: req.user._id }, investorData);
        req.flash("success", "Preferences updated successfully!");
    } else {
        // Create
        investor = new Investor(investorData);
        await investor.save();
        await User.findByIdAndUpdate(req.user._id, { hasFilledProfile: true });
        req.flash("success", "Investor profile completed!");
    }

    res.redirect("/investor/dashboard");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/investor/profile");
  }
});

// Investor Dashboard with AI Matching
app.get("/investor/dashboard", isLoggedIn, async (req, res) => {
    if (req.user.role !== "investor") return res.redirect("/");

    try {
        const investor = await Investor.findOne({ userId: req.user._id });
        
        // If they haven't filled the profile yet, redirect them
        if (!investor) return res.redirect("/investor/profile");

        // Fetch all startups to show the investor
        const allStartups = await Startup.find();

        // Use our Gemini Matcher (Startup is the target now)
        // We swap the logic: one investor vs many startups
        const aiMatches = await getAIBasedMatchesForInvestor(investor, allStartups);

        // Map the data for EJS
        const curatedStartups = aiMatches.map(match => {
            const startupData = allStartups.find(s => s._id.toString() === match.startupId);
            return {
                startup: startupData,
                score: match.score,
                reasoning: match.reasoning
            };
        });

        curatedStartups.sort((a, b) => b.score - a.score);

        res.render("trial/investordashboard", { investor, startups: curatedStartups });
    } catch (err) {
        console.error(err);
        res.render("trial/investordashboard", { investor: {}, startups: [] });
    }
});
// ================= MATCHING =================

app.get("/matches/:startupId", isLoggedIn, async (req, res) => {
    try {
        if (req.user.role !== "startup") return res.redirect("/");

        const startup = await Startup.findById(req.params.startupId);
        const investors = await Investor.find(); // Fetch all potential investors

        if (!startup) {
            req.flash("error", "Startup profile not found.");
            return res.redirect("/startup/profile");
        }

        // Call Gemini for intelligent matching
        const aiMatches = await getAIBasedMatches(startup, investors);

        // Combine the AI scores with the Investor objects for the EJS view
        const finalMatches = aiMatches.map(match => {
            const investorData = investors.find(inv => inv._id.toString() === match.investorId);
            return {
                investor: investorData,
                score: match.score,
                reasoning: match.reasoning
            };
        });

        // Sort by highest score
        finalMatches.sort((a, b) => b.score - a.score);

        res.render("trial/match", { startup, matches: finalMatches });

    } catch (err) {
        console.error("Gemini Error:", err);
        req.flash("error", "AI Matching failed. Falling back to basic search.");
        res.redirect("/startup/dashboard");
    }
});
// ================= INVESTOR MATCHES =================

app.get("/investor/matches/:investorId", isLoggedIn, async (req, res) => {
    try {
        // Authorization: Ensure the user is an investor and viewing their own matches
        if (req.user.role !== "investor") return res.redirect("/");

        const investor = await Investor.findById(req.params.investorId);
        const startups = await Startup.find(); // Fetch all startups in the database

        if (!investor) {
            req.flash("error", "Investor profile not found.");
            return res.redirect("/investor/profile");
        }

        // Call Gemini for intelligent matching (swapping perspective)
        const aiMatches = await getAIBasedMatchesForInvestor(investor, startups);

        // Map AI scores to the Startup objects
        const finalMatches = aiMatches.map(match => {
            const startupData = startups.find(s => s._id.toString() === match.startupId);
            return {
                startup: startupData,
                score: match.score,
                reasoning: match.reasoning
            };
        });

        // Sort by highest score
        finalMatches.sort((a, b) => b.score - a.score);

        // Render a match page specifically designed for investors
        res.render("trial/investor_match", { investor, matches: finalMatches });

    } catch (err) {
        console.error("Gemini Investor Match Error:", err);
        req.flash("error", "AI Matching failed. Please try again later.");
        res.redirect("/investor/dashboard");
    }
});


app.listen(8080, () => {
  console.log("Server is Listening on port 8080");
});
