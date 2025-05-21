import { DeepgramError, createClient } from "@deepgram/sdk";
import { NextResponse, type NextRequest } from "next/server";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Development fallback using environment variable
  if (process.env.DEEPGRAM_ENV === "development") {
    return NextResponse.json({
      key: process.env.DEEPGRAM_API_KEY ?? "",
    });
  }

  // Skip API calls during build time to prevent build failures
  if (
    process.env.VERCEL_ENV === "production" &&
    process.env.VERCEL_BUILDING === "1"
  ) {
    console.log("Skipping Deepgram API calls during build time");
    return NextResponse.json({
      key: "build-time-placeholder",
      message:
        "This is a build-time placeholder. Actual key will be generated at runtime.",
    });
  }

  // Regular runtime operation - generate temporary key
  try {
    const url = request.url;
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");

    let { result: projectsResult, error: projectsError } =
      await deepgram.manage.getProjects();

    if (projectsError) {
      return NextResponse.json(projectsError);
    }

    const project = projectsResult?.projects[0];

    if (!project) {
      return NextResponse.json(
        new DeepgramError(
          "Cannot find a Deepgram project. Please create a project first."
        )
      );
    }

    let { result: newKeyResult, error: newKeyError } =
      await deepgram.manage.createProjectKey(project.project_id, {
        comment: "Temporary API key",
        scopes: ["usage:write"],
        tags: ["next.js"],
        time_to_live_in_seconds: 60,
      });

    if (newKeyError) {
      return NextResponse.json(newKeyError);
    }

    const response = NextResponse.json({ ...newKeyResult, url });
    response.headers.set("Surrogate-Control", "no-store");
    response.headers.set(
      "Cache-Control",
      "s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    console.error("Error generating Deepgram key:", error);
    return NextResponse.json(
      {
        error: "Failed to generate Deepgram key",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
