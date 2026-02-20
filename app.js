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

const User = require("./models/User");



app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));




mongoose.set("strictQuery", false);

mongoose.connect("mongodb://127.0.0.1:27017/nexus")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));



app.use(session({
  secret: process.env.SECRET || "supersecret",
  resave: false,
  saveUninitialized: false,
}));



app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());



function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}



// HOME
app.get("/", (req, res) => {
  res.render("layout/index");
});



app.get("/signup", (req, res) => {
  res.render("trial/signup");
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const newUser = new User({ username, email, role });

    const registeredUser = await User.register(newUser, password);

    // Auto login after signup
    req.login(registeredUser, (err) => {
      if (err) return res.redirect("/login");

      if (registeredUser.role === "startup") {
        return res.redirect("/startup_profile");
      } else {
        return res.redirect("/investor_profile");
      }
    });

  } catch (err) {
    console.log(err);
    res.redirect("/signup");
  }
});




app.get("/login", (req, res) => {
  res.render("trial/login");
});

app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login"
  }),
  (req, res) => {

    if (req.user.role === "startup") {
      return res.redirect("/startup_profile");
    }

    return res.redirect("/investor_profile");
  }
);




app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/login");
    });
  });
});




app.get("/startup_profile", isLoggedIn, (req, res) => {
  if (req.user.role !== "startup") {
    return res.redirect("/");
  }
  res.render("trial/startup_profile");
});

app.get("/investor_profile", isLoggedIn, (req, res) => {
  if (req.user.role !== "investor") {
    return res.redirect("/");
  }
  res.render("trial/investor_profile");
});



app.listen(8080, () => {
  console.log("Server is Listening on port 8080");
});