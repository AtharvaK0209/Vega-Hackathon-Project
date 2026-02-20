
const express=require("express");
const app=express();
const mongoose=require("mongoose");
const path=require("path");
const ejsmate=require("ejs-mate");
const session=require("express-session");



app.set("view engine","ejs");
app.set("views",path.join(__dirname,"views"));
app.engine("ejs",ejsmate);
app.use(express.static(path.join(__dirname,"public")));




main().then(()=>{console.log("Mongodb connected")}).catch((err)=>{console.log(err)});

async function main(){
    await mongoose.connect("mongodb://127.0.0.1:27017/nexus");
}


app.get("/",(req,res)=>{
    res.send("Hi i am root");
});


app.listen(8080,(req,res)=>{
    console.log("Server is Listening");
});
