if(process.env.NODE_ENV !="production"){
    require('dotenv').config()
}
const express=require("express");
const app=express();
const mongoose=require("mongoose");
const path=require("path");
const ejsmate=require("ejs-mate");
const session=require("express-session");
const User=require("./models/User");
const passport = require("passport");



app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.engine("ejs",ejsmate);
app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

app.use(express.static(path.join(__dirname,"public")));

const sessionOption={
  secret:process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    expires:Date.now()+7*24*60*60*1000,
    maxAge:30*24*60*60*1000,
    httpOnly:true,
  }
}
app.use(session(sessionOption));
app.use(passport.initialize());
app.use(passport.session());

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


main().then(()=>{console.log("Mongodb connected")}).catch((err)=>{console.log(err)});

async function main(){
    await mongoose.connect("mongodb://127.0.0.1:27017/nexus");
}


app.get("/",(req,res)=>{
    res.render("layout/index");
});

app.get("/signup",(req,res)=>{
    res.render("trial/signup");
});
app.post("/signup",async(req,res)=>{
    let {username,email,password,role}=req.body;
    let newuser=new User({email,username,role});
    let register=await User.register(newuser,password);
    console.log(register);
    res.send("User registerd");



})

app.get("/login",(req,res)=>{
    res.render("trial/login");
});
app.post("/login",passport.authenticate("local",{failureRedirect:"/login"}), (req,res)=>{
    res.send("Hello user");
})


app.listen(8080,(req,res)=>{
    console.log("Server is Listening");
});
