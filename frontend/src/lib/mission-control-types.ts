/**
 * lib/mission-control-types.ts
 *
 * The MissionControlMessage type is what the panel actually renders. It's a
 * flattened, display-ready version of the backend's AgentMessage: we resolve
 * role -> display name/initials once (in the adapter), stamp a stable id, and
 * carry the kind of message so the UI can style rejections differently from
 * approvals differently from broadcasts.
 */

export type MissionControlMessageKind =
  | "message"       // plain send_message
  | "broadcast"     // recipient === "*"
  | "review_request"
  | "approval"
  | "rejection"
  | "escalation";

export type MissionControlMessage = {
  id: string;
  /** Backend role, e.g. "CEO", "Product Manager". */
  senderRole: string;
  senderName: string;
  senderInitials: string;
  /** Backend role, or "*" for broadcast. */
  recipientRole: string;
  recipientName: string;
  /** Formatted HH:MM:SS local time for the header row. */
  timestamp: string;
  /** ISO string preserved for tooltips / accessibility. */
  timestampIso: string;
  content: string;
  kind: MissionControlMessageKind;
  /**
   * "delivered" for normal messages; "seen" once the recipient has *sent*
   * anything after this message arrived (their acknowledgement). Approvals and
   * rejections are always "delivered" -- the acknowledgement is the action
   * itself.
   */
  status: "delivered" | "seen";
};
