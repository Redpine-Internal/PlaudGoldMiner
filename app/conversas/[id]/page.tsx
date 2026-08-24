import { ConversationDetailView } from "@/components/conversation/ConversationDetailView";

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationDetailView id={id} />;
}
