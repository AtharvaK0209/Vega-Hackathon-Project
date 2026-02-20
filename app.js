
const express=require("express");
const app=express();
const mongoose=require("mongoose");
const path=require("path");
const ejsmate=require("ejs-mate");
const session=require("express-session");
const User=require("./models/User");



app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.engine("ejs",ejsmate);
app.use(express.static(path.join(__dirname,"public")));




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
app.post("/signup",async (req,res)=>{
    let {name,email,password,role}=req.body;
    let newuser=new User({email,name,role});
    let register=await User.register(newuser,password);
    console.log(register);
    res.send("User registerd");



})

app.get("/login",(req,res)=>{
    res.render("trial/login");
});


app.listen(8080,(req,res)=>{
    console.log("Server is Listening");
});
