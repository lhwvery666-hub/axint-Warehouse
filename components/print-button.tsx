'use client';

interface PrintButtonProps {
  children?: React.ReactNode;
}

export function PrintButton({ children }: PrintButtonProps) {
  const handlePrint = () => {
    window.print();
  };

  if (children) {
    return <div onClick={handlePrint}>{children}</div>;
  }

  return (
    <button
      onClick={handlePrint}
      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-lg"
    >
      打印报告
    </button>
  );
}
