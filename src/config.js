const  mongoose = require("mongoose");
const connect = mongoose.connect("mongodb://localhost:27017/test");

// Check connection 

connect.then(()=>{
    console.log("Database Connected Successfully");
})
 .catch(()=> {
    console.log("Database cannot be Connected");
 })

// Crate a Schema

const LoginSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password:{
        type:String,
        required: true
    }
});

//collection part

const collection = new mongoose.model("users", LoginSchema)

module.exports = collection;