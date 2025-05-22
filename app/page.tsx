"use client";

import Image from "next/image";
import App from "./components/App";

const Home = () => {
  return (
    <>
      <div className="h-full overflow-hidden">
        {/* height 4rem */}
        <div className="bg-gradient-to-b from-black/50 to-black/10 backdrop-blur-[2px] h-[4rem] flex items-center">
          <header className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8 flex items-center justify-between">
              <h1 className="text-2xl font-bold">LiveCaps</h1>
          </header>
        </div>

        {/* height 100% minus 8rem */}
        <main className="mx-auto w-full px-4 md:px-6 lg:px-8 h-[calc(100%-4rem)] -mb-[4rem]">
          <App />
        </main>

        {/* height 4rem */}
      </div>
    </>
  );
};

export default Home;
