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
const ConnectionRequest = require("./models/ConnectionRequest");

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
        // Fallback: If AI fails, return basic scores
        return investors.map(i => ({
            investorId: i._id.toString(),
            score: 0,
            reasoning: "AI Matcher currently unavailable."
        }));
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
            "reasoning": "A concise explanation of the investment fit",
            "pros": "Why this is a good investment choice",
            "cons": "Potential risks or concerns"
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
        const allStartups = await Startup.find().populate('userId', 'email');

        // Use our Gemini Matcher (Startup is the target now)
        // We swap the logic: one investor vs many startups
        const aiMatches = await getAIBasedMatchesForInvestor(investor, allStartups);

        // Map the data for EJS
        const curatedStartups = aiMatches.map(match => {
            const startupData = allStartups.find(s => s._id.toString() === match.startupId);
            return {
                startup: startupData,
                score: match.score,
                reasoning: match.reasoning,
                pros: match.pros,
                cons: match.cons
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
                reasoning: match.reasoning,
                pros: match.pros,
                cons: match.cons
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

// ================= CONNECTION REQUESTS =================

// Send Connection Request
app.post("/connect", isLoggedIn, async (req, res) => {
    try {
        const { receiverId, message } = req.body;
        const senderId = req.user._id;
        const senderRole = req.user.role;

        // Prevent self-connection (shouldn't happen via UI but good to have)
        if (senderId.equals(receiverId)) {
            req.flash("error", "You cannot connect with yourself.");
            return res.redirect(req.get('Referer') || '/');
        }

        // Check if request already exists
        const existingRequest = await ConnectionRequest.findOne({
            senderId,
            receiverId,
            status: "pending"
        });

        if (existingRequest) {
            req.flash("error", "Connection request already pending.");
            return res.redirect(req.get('Referer') || '/');
        }

        const newRequest = new ConnectionRequest({
            senderId,
            receiverId,
            senderRole,
            message,
            status: "pending"
        });

        await newRequest.save();
        req.flash("success", "Connection request sent!");
        res.redirect(req.get('Referer') || '/');

    } catch (err) {
        console.error("Connection Error:", err);
        req.flash("error", "Failed to send connection request.");
        res.redirect(req.get('Referer') || '/');
    }
});

// View Connections (Incoming & Outgoing)
app.get("/connections", isLoggedIn, async (req, res) => {
    try {
        // Find incoming requests (where I am the receiver)
        const incomingRequests = await ConnectionRequest.find({
            receiverId: req.user._id,
            status: "pending"
        }).populate("senderId"); // Get user details

        const enrichedIncoming = await Promise.all(incomingRequests.map(async (requestItem) => {
            if (!requestItem.senderId) return null; // Skip if user deleted

            let profile;
            if (requestItem.senderRole === "startup") {
                profile = await Startup.findOne({ userId: requestItem.senderId._id });
            } else {
                profile = await Investor.findOne({ userId: requestItem.senderId._id });
            }
            return {
                request: requestItem,
                profile: profile
            };
        }));

        // Filter out nulls
        const validIncoming = enrichedIncoming.filter(item => item !== null);

        // Find outgoing requests (where I am the sender)
        const outgoingRequests = await ConnectionRequest.find({
            senderId: req.user._id,
            status: "pending"
        }).populate("receiverId");

        const enrichedOutgoing = await Promise.all(outgoingRequests.map(async (requestItem) => {
            if (!requestItem.receiverId) return null; // Skip if user deleted

            let profile;
            if (requestItem.senderRole === "startup") {
                // Sender (me) is startup -> Receiver is Investor
                profile = await Investor.findOne({ userId: requestItem.receiverId._id });
            } else {
                // Sender (me) is investor -> Receiver is Startup
                profile = await Startup.findOne({ userId: requestItem.receiverId._id });
            }
            return {
                request: requestItem,
                profile: profile
            };
        }));

        // Filter out nulls
        const validOutgoing = enrichedOutgoing.filter(item => item !== null);

        // Find my accepted connections
        const connections = await ConnectionRequest.find({
            $or: [
                { senderId: req.user._id, status: "accepted" },
                { receiverId: req.user._id, status: "accepted" }
            ]
        }).populate("senderId receiverId");

        const enrichedConnections = await Promise.all(connections.map(async (conn) => {
            if (!conn.senderId || !conn.receiverId) return null; // Safety check

            const isMeSender = conn.senderId._id.equals(req.user._id);
            const otherUser = isMeSender ? conn.receiverId : conn.senderId;
            
            let profile;
            if (req.user.role === 'startup') {
                // I am startup -> Other is investor
                profile = await Investor.findOne({ userId: otherUser._id });
            } else {
                // I am investor -> Other is startup
                profile = await Startup.findOne({ userId: otherUser._id });
            }

            return {
                connection: conn,
                otherUser: otherUser,
                profile: profile
            };
        }));

        // Filter out nulls
        const validConnections = enrichedConnections.filter(item => item !== null);

        res.render("trial/connections", { 
            incoming: validIncoming, 
            outgoing: validOutgoing,
            connections: validConnections 
        });

    } catch (err) {
        console.error("View Connections Error:", err);
        req.flash("error", "Could not load connections.");
        res.redirect("/");
    }
});

// Cancel Connection Request
app.post("/connect/:id/cancel", isLoggedIn, async (req, res) => {
    try {
        const { id } = req.params;
        const request = await ConnectionRequest.findById(id);
        
        if (!request) {
            req.flash("error", "Request not found.");
            return res.redirect("/connections");
        }

        // Verify I am the sender
        if (!request.senderId.equals(req.user._id)) {
            req.flash("error", "Unauthorized.");
            return res.redirect("/connections");
        }

        await ConnectionRequest.findByIdAndDelete(id);
        req.flash("success", "Request cancelled.");
        res.redirect("/connections");

    } catch (err) {
        console.error("Cancel Error:", err);
        req.flash("error", "Could not cancel request.");
        res.redirect("/connections");
    }
});

// Accept/Reject Connection Request
app.post("/connect/:id/:action", isLoggedIn, async (req, res) => {
    try {
        const { id, action } = req.params;
        if (!["accept", "reject"].includes(action)) {
            return res.redirect("/connections");
        }

        const request = await ConnectionRequest.findById(id);
        if (!request) {
            req.flash("error", "Request not found.");
            return res.redirect("/connections");
        }

        // Verify I am the receiver
        if (!request.receiverId.equals(req.user._id)) {
            req.flash("error", "Unauthorized.");
            return res.redirect("/connections");
        }

        request.status = action === "accept" ? "accepted" : "rejected";
        await request.save();

        req.flash("success", `Connection ${action}ed!`);
        res.redirect("/connections");

    } catch (err) {
        console.error("Action Error:", err);
        req.flash("error", "Action failed.");
        res.redirect("/connections");
    }
});

app.listen(8080, () => {
  console.log("Server is Listening on port 8080");
});
