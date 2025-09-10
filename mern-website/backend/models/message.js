import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ["patient", "doctor"], 
    required: true
  },
  text: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const ConversationSchema = new mongoose.Schema({
  patientId: {
    type: String, 
    required: true
  },
  messages: [MessageSchema], 
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Conversation = mongoose.model("Conversation", ConversationSchema);

export default Conversation;
