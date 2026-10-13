import AssistantChat from '../components/AssistantChat.jsx'

export default function AssistantPage() {
  return (
    <main className="page">
      <p className="eyebrow">Assistant</p>
      <h1 className="page-title">Ask about your records</h1>
      <p className="lede">
        Ask about the records in this account. MoneyMap calculates the totals first, and the assistant explains them.
        It cannot add, edit, or delete anything.
      </p>
      <p className="note mt-3">
        This is a plain-language explanation of your MoneyMap records. It is not professional financial, tax, or
        investment advice. Holdings are simulated prices you entered.
      </p>
      <AssistantChat layout="page" />
    </main>
  )
}
