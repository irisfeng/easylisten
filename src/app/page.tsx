import { EVERGREEN_PIECES, ISSUE_PIECES, LATEST_NOTE, summarize } from "@/lib/pieces";
import HomeClient from "./HomeClient";

/** 首页只把稿件摘要交给浏览器；正文留在各自的阅读页。 */
export default function Home() {
  return (
    <HomeClient
      issuePieces={ISSUE_PIECES.map(summarize)}
      evergreenPieces={EVERGREEN_PIECES.map(summarize)}
      latestNote={LATEST_NOTE}
    />
  );
}
