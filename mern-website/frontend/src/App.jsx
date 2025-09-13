// App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AnalysisPage from "./pages/AnalysisPage";
import Homepage from "./pages/Homepage";
import {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  UserButton,
} from "@clerk/clerk-react";

const App = () => {
  return (
    <div>
      <SignedIn>
    <header className="flex justify-end p-4 bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700">
          <UserButton afterSignOutUrl="/" appearance={{ baseTheme: 'dark' }} />
        </header>
       <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
      </Routes>
    </BrowserRouter>

      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </div>
  );
};

export default App;
